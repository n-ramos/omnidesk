import { promises as dns } from 'node:dns'
import { AppError } from '@shared/errors'
import type {
  MailAutodiscoverResult,
  MailServerSettings,
  MailSocketType,
} from '@shared/models'
import { logger } from '@main/logger'
import { inferProviderBrand } from './providerBrands'

const FETCH_TIMEOUT_MS = 4_000
const DNS_TIMEOUT_MS = 3_000

const SECURE_IMAP_PORTS = new Set([993])
const STARTTLS_IMAP_PORTS = new Set([143])
const SECURE_SMTP_PORTS = new Set([465])
const STARTTLS_SMTP_PORTS = new Set([587, 25])

const inferSocketType = (port: number, declared?: string): MailSocketType => {
  if (declared) {
    const normalized = declared.toLowerCase()
    if (normalized === 'ssl' || normalized === 'tls') {
      return 'SSL'
    }
    if (normalized.includes('starttls')) {
      return 'STARTTLS'
    }
    if (normalized === 'plain' || normalized === 'none') {
      return 'plain'
    }
  }

  if (SECURE_IMAP_PORTS.has(port) || SECURE_SMTP_PORTS.has(port)) {
    return 'SSL'
  }
  if (STARTTLS_IMAP_PORTS.has(port) || STARTTLS_SMTP_PORTS.has(port)) {
    return 'STARTTLS'
  }
  return 'SSL'
}

const expandUsername = (template: string | undefined, email: string): string => {
  if (!template || template.length === 0) {
    return email
  }

  const [local = email, domain = ''] = email.split('@')
  return template
    .replace(/%EMAILADDRESS%/gi, email)
    .replace(/%EMAILLOCALPART%/gi, local)
    .replace(/%EMAILDOMAIN%/gi, domain)
}

const fetchWithTimeout = async (url: string): Promise<Response | undefined> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Omnidesk-Desktop/0.1 (autoconfig)',
        Accept: 'application/xml, text/xml, */*;q=0.8',
      },
    })
    if (!response.ok) {
      return undefined
    }
    return response
  } catch (error) {
    logger.debug?.('autoconfig fetch failed', { url, error: (error as Error).message })
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

const extractTagBlock = (xml: string, tag: string): string[] => {
  const pattern = new RegExp(`<${tag}([^>]*)>([\\s\\S]*?)</${tag}>`, 'gi')
  const blocks: string[] = []
  for (const match of xml.matchAll(pattern)) {
    blocks.push(`<${tag}${match[1]}>${match[2]}</${tag}>`)
  }
  return blocks
}

const extractAttribute = (block: string, name: string): string | undefined => {
  const match = block.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'))
  return match ? match[1] : undefined
}

const extractText = (block: string, tag: string): string | undefined => {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  const inner = match?.[1]
  if (!inner) {
    return undefined
  }
  const trimmed = inner.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const parseMozillaAutoconfig = (
  xml: string,
  email: string,
): { imap?: MailServerSettings; smtp?: MailServerSettings; emailProvider?: string; displayName?: string; documentationUrl?: string } => {
  const providerBlocks = extractTagBlock(xml, 'emailProvider')
  const provider = providerBlocks[0] ?? xml
  const emailProvider = extractAttribute(provider, 'id') || extractText(provider, 'domain')
  const displayName = extractText(provider, 'displayName')
  const documentationUrl = extractText(provider, 'documentation')

  let imap: MailServerSettings | undefined
  const incomingBlocks = extractTagBlock(provider, 'incomingServer')
  for (const block of incomingBlocks) {
    const type = extractAttribute(block, 'type')
    if (type && type.toLowerCase() !== 'imap') {
      continue
    }

    const host = extractText(block, 'hostname')
    const portRaw = extractText(block, 'port')
    if (!host || !portRaw) {
      continue
    }

    const port = Number.parseInt(portRaw, 10)
    if (!Number.isFinite(port)) {
      continue
    }

    const socketType = inferSocketType(port, extractText(block, 'socketType'))
    const username = expandUsername(extractText(block, 'username'), email)
    imap = { host, port, socketType, username }
    break
  }

  let smtp: MailServerSettings | undefined
  const outgoingBlocks = extractTagBlock(provider, 'outgoingServer')
  for (const block of outgoingBlocks) {
    const type = extractAttribute(block, 'type')
    if (type && type.toLowerCase() !== 'smtp') {
      continue
    }

    const host = extractText(block, 'hostname')
    const portRaw = extractText(block, 'port')
    if (!host || !portRaw) {
      continue
    }

    const port = Number.parseInt(portRaw, 10)
    if (!Number.isFinite(port)) {
      continue
    }

    const socketType = inferSocketType(port, extractText(block, 'socketType'))
    const username = expandUsername(extractText(block, 'username'), email)
    smtp = { host, port, socketType, username }
    break
  }

  return { imap, smtp, emailProvider, displayName, documentationUrl }
}

const tryMozillaSource = async (
  url: string,
  email: string,
  source: MailAutodiscoverResult['source'],
): Promise<MailAutodiscoverResult | undefined> => {
  const response = await fetchWithTimeout(url)
  if (!response) {
    return undefined
  }

  const xml = await response.text()
  const parsed = parseMozillaAutoconfig(xml, email)

  if (!parsed.imap && !parsed.smtp) {
    return undefined
  }

  return {
    source,
    emailProvider: parsed.emailProvider,
    displayName: parsed.displayName,
    documentationUrl: parsed.documentationUrl,
    imap: parsed.imap,
    smtp: parsed.smtp,
  }
}

const withDnsTimeout = async <T>(promise: Promise<T>): Promise<T | undefined> => {
  return Promise.race<T | undefined>([
    promise.catch(() => undefined),
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), DNS_TIMEOUT_MS)),
  ])
}

const tryDnsSrv = async (
  domain: string,
  email: string,
): Promise<MailAutodiscoverResult | undefined> => {
  const [imapsSecure, imapsStarttls, submissions, submission] = await Promise.all([
    withDnsTimeout(dns.resolveSrv(`_imaps._tcp.${domain}`)),
    withDnsTimeout(dns.resolveSrv(`_imap._tcp.${domain}`)),
    withDnsTimeout(dns.resolveSrv(`_submissions._tcp.${domain}`)),
    withDnsTimeout(dns.resolveSrv(`_submission._tcp.${domain}`)),
  ])

  const pickBest = (
    records: Array<{ name: string; port: number; priority: number }> | undefined,
  ): { name: string; port: number } | undefined => {
    if (!records || records.length === 0) {
      return undefined
    }
    const sorted = [...records].sort((a, b) => a.priority - b.priority)
    const winner = sorted[0]
    if (!winner) {
      return undefined
    }
    return { name: winner.name.replace(/\.$/, ''), port: winner.port }
  }

  const imapTls = pickBest(imapsSecure)
  const imapPlain = pickBest(imapsStarttls)
  const smtpTls = pickBest(submissions)
  const smtpStarttls = pickBest(submission)

  if (!imapTls && !imapPlain && !smtpTls && !smtpStarttls) {
    return undefined
  }

  const imap: MailServerSettings | undefined = imapTls
    ? { host: imapTls.name, port: imapTls.port, socketType: 'SSL', username: email }
    : imapPlain
      ? { host: imapPlain.name, port: imapPlain.port, socketType: 'STARTTLS', username: email }
      : undefined

  const smtp: MailServerSettings | undefined = smtpTls
    ? { host: smtpTls.name, port: smtpTls.port, socketType: 'SSL', username: email }
    : smtpStarttls
      ? { host: smtpStarttls.name, port: smtpStarttls.port, socketType: 'STARTTLS', username: email }
      : undefined

  if (!imap && !smtp) {
    return undefined
  }

  return {
    source: 'dns-srv',
    emailProvider: domain,
    imap,
    smtp,
  }
}

const tryDnsMx = async (
  domain: string,
  email: string,
): Promise<MailAutodiscoverResult | undefined> => {
  const records = await withDnsTimeout(dns.resolveMx(domain))
  if (!records || records.length === 0) {
    return undefined
  }

  const sorted = [...records].sort((a, b) => a.priority - b.priority)
  const top = sorted[0]
  if (!top) {
    return undefined
  }
  const exchange = top.exchange.replace(/\.$/, '').toLowerCase()
  const parts = exchange.split('.')
  const mxBase = parts.length >= 2 ? parts.slice(-2).join('.') : exchange

  return {
    source: 'dns-mx',
    emailProvider: mxBase,
    imap: { host: `imap.${mxBase}`, port: 993, socketType: 'SSL', username: email },
    smtp: { host: `smtp.${mxBase}`, port: 465, socketType: 'SSL', username: email },
  }
}

const guessFromDomain = (domain: string, email: string): MailAutodiscoverResult => ({
  source: 'guess',
  emailProvider: domain,
  imap: { host: `imap.${domain}`, port: 993, socketType: 'SSL', username: email },
  smtp: { host: `smtp.${domain}`, port: 465, socketType: 'SSL', username: email },
})

const mergeResults = (
  primary: MailAutodiscoverResult,
  fallback: MailAutodiscoverResult | undefined,
): MailAutodiscoverResult => {
  if (!fallback) {
    return primary
  }

  return {
    source: primary.source,
    emailProvider: primary.emailProvider ?? fallback.emailProvider,
    displayName: primary.displayName ?? fallback.displayName,
    documentationUrl: primary.documentationUrl ?? fallback.documentationUrl,
    imap: primary.imap ?? fallback.imap,
    smtp: primary.smtp ?? fallback.smtp,
  }
}

export const autodiscoverMailSettings = async (
  email: string,
): Promise<MailAutodiscoverResult> => {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed.includes('@')) {
    throw new AppError('VALIDATION_FAILED', "L'adresse mail n'est pas valide.")
  }

  const domain = trimmed.split('@')[1]
  if (!domain) {
    throw new AppError('VALIDATION_FAILED', "Le domaine de l'adresse mail est manquant.")
  }

  const sources: Array<() => Promise<MailAutodiscoverResult | undefined>> = [
    () =>
      tryMozillaSource(
        `https://autoconfig.${domain}/mail/config-v1.1.xml?emailaddress=${encodeURIComponent(trimmed)}`,
        trimmed,
        'mozilla-isp',
      ),
    () =>
      tryMozillaSource(
        `https://${domain}/.well-known/autoconfig/mail/config-v1.1.xml?emailaddress=${encodeURIComponent(trimmed)}`,
        trimmed,
        'mozilla-isp',
      ),
    () =>
      tryMozillaSource(
        `https://autoconfig.thunderbird.net/v1.1/${domain}`,
        trimmed,
        'mozilla-thunderbird',
      ),
    () => tryDnsSrv(domain, trimmed),
    () => tryDnsMx(domain, trimmed),
  ]

  let best: MailAutodiscoverResult | undefined

  for (const attempt of sources) {
    try {
      const result = await attempt()
      if (!result) {
        continue
      }

      best = best ? mergeResults(best, result) : result

      if (best.imap && best.smtp) {
        return finalize(best, trimmed)
      }
    } catch (error) {
      logger.debug?.('autoconfig source failed', { error: (error as Error).message })
    }
  }

  return finalize(best ?? guessFromDomain(domain, trimmed), trimmed)
}

const finalize = (
  result: MailAutodiscoverResult,
  email: string,
): MailAutodiscoverResult => {
  const inferred = inferProviderBrand(email, [result.imap?.host, result.smtp?.host])
  const displayName = result.displayName ?? inferred
  return { ...result, displayName }
}

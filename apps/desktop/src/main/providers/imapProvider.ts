import { Buffer } from 'node:buffer'
import { convert as htmlToText } from 'html-to-text'
import { ImapFlow, type FetchMessageObject } from 'imapflow'
import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser'
import nodemailer, { type Transporter } from 'nodemailer'
import { AppError } from '@shared/errors'
import { buildTextPreview } from '@shared/textPreview'
import type {
  MailFolderRole,
  MailFolderSummary,
  MailServerSettings,
} from '@shared/models'
import { logger } from '@main/logger'
import { PlaceholderProvider } from './baseProvider'
import { parseImapAccountSettings } from './imap/imapTypes'
import type {
  OutgoingAttachmentInput,
  ProviderConversationParticipant,
  ProviderConversationRecord,
  ProviderMessageAttachment,
  ProviderMessageRecord,
  ProviderRuntimeContext,
  ProviderSyncResult,
  SendMessageInput,
  SendMessageResult,
} from './provider.types'

const INBOX_FETCH_LIMIT = 30
const SUBJECT_PREFIX_PATTERN = /^\s*(?:re|fw|fwd|tr|rep|sv)\s*:\s*/i

const FOLDER_ROLE_ORDER: MailFolderRole[] = [
  'inbox',
  'flagged',
  'drafts',
  'sent',
  'archive',
  'all',
  'junk',
  'trash',
  'other',
]

const FOLDER_ROLE_PATTERNS: Array<{ role: MailFolderRole; patterns: RegExp[] }> = [
  { role: 'inbox', patterns: [/^inbox$/i, /boite.*reception/i] },
  { role: 'sent', patterns: [/sent/i, /envoy/i, /\[gmail\]\/sent/i] },
  { role: 'drafts', patterns: [/drafts?/i, /brouillon/i] },
  { role: 'trash', patterns: [/trash/i, /corbeille/i, /deleted/i, /\[gmail\]\/(trash|corbeille)/i] },
  { role: 'junk', patterns: [/junk/i, /spam/i, /pourriel/i, /ind[eé]sirable/i] },
  { role: 'archive', patterns: [/archive/i, /\[gmail\]\/all/i] },
  { role: 'all', patterns: [/\[gmail\]\/all/i, /tous les messages/i] },
  { role: 'flagged', patterns: [/flagged/i, /starred/i, /suivi/i] },
]

const detectFolderRole = (
  path: string,
  specialUse?: string,
  flags?: Set<string> | string[],
): MailFolderRole => {
  const flagsSet = flags instanceof Set ? flags : new Set(flags ?? [])
  const flagOrSpecial = (specialUse ?? '').toLowerCase()
  const allFlags = [...flagsSet].map((flag) => flag.toLowerCase()).join(' ')

  if (flagOrSpecial.includes('inbox') || allFlags.includes('\\inbox')) return 'inbox'
  if (flagOrSpecial.includes('sent') || allFlags.includes('\\sent')) return 'sent'
  if (flagOrSpecial.includes('drafts') || allFlags.includes('\\drafts')) return 'drafts'
  if (flagOrSpecial.includes('trash') || allFlags.includes('\\trash')) return 'trash'
  if (flagOrSpecial.includes('junk') || allFlags.includes('\\junk')) return 'junk'
  if (flagOrSpecial.includes('archive') || allFlags.includes('\\archive')) return 'archive'
  if (flagOrSpecial.includes('all') || allFlags.includes('\\all')) return 'all'
  if (flagOrSpecial.includes('flagged') || allFlags.includes('\\flagged')) return 'flagged'

  for (const rule of FOLDER_ROLE_PATTERNS) {
    if (rule.patterns.some((pattern) => pattern.test(path))) {
      return rule.role
    }
  }
  return 'other'
}

const sortFolders = (folders: MailFolderSummary[]): MailFolderSummary[] => {
  return [...folders].sort((left, right) => {
    const leftOrder = FOLDER_ROLE_ORDER.indexOf(left.role)
    const rightOrder = FOLDER_ROLE_ORDER.indexOf(right.role)
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
  })
}

const selectedFolder = (settings: Record<string, unknown>): string => {
  const value = settings.selectedFolder
  return typeof value === 'string' && value.length > 0 ? value : 'INBOX'
}

const normalizeSubject = (subject?: string): string => {
  if (!subject) {
    return '(sans objet)'
  }
  let cleaned = subject.trim()
  while (SUBJECT_PREFIX_PATTERN.test(cleaned)) {
    cleaned = cleaned.replace(SUBJECT_PREFIX_PATTERN, '').trim()
  }
  return cleaned.length > 0 ? cleaned : '(sans objet)'
}

const ensureAngleWrapped = (token: string): string => {
  const trimmed = token.trim().replace(/^[<\s]+|[>\s]+$/g, '')
  return trimmed.length > 0 ? `<${trimmed}>` : ''
}

const parseReferences = (value: unknown): string[] => {
  if (!value) {
    return []
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseReferences(entry))
  }

  if (typeof value !== 'string') {
    return []
  }

  const angled = value.match(/<[^>]+>/g)
  if (angled && angled.length > 0) {
    return angled
  }

  return value
    .split(/[\s,]+/)
    .map((token) => ensureAngleWrapped(token))
    .filter((token) => token.length > 0)
}

const threadRootFromHeaders = (
  messageId: string | undefined,
  references: string[],
  inReplyTo: string[],
): string => {
  const fromReferences = references[0]
  if (fromReferences) {
    return fromReferences
  }
  const fromInReplyTo = inReplyTo[0]
  if (fromInReplyTo) {
    return fromInReplyTo
  }
  return messageId ?? `imap:no-id:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

const addressList = (addresses?: AddressObject | AddressObject[]): Array<{ name?: string; address?: string }> => {
  if (!addresses) {
    return []
  }
  const flat = Array.isArray(addresses) ? addresses : [addresses]
  const out: Array<{ name?: string; address?: string }> = []
  for (const entry of flat) {
    for (const item of entry.value ?? []) {
      out.push({ name: item.name, address: item.address })
    }
  }
  return out
}

const firstAddress = (entries: Array<{ name?: string; address?: string }>): { name?: string; address?: string } | undefined =>
  entries.find((entry) => entry.address) ?? entries[0]

const buildParticipants = (
  parsed: ParsedMail,
): ProviderConversationParticipant[] => {
  const participants = new Map<string, ProviderConversationParticipant>()

  const collect = (entries: Array<{ name?: string; address?: string }>, role: string): void => {
    for (const entry of entries) {
      const key = (entry.address ?? entry.name ?? '').toLowerCase().trim()
      if (!key) {
        continue
      }
      if (participants.has(key)) {
        continue
      }
      participants.set(key, {
        externalParticipantId: entry.address ?? entry.name,
        displayName: entry.name,
        address: entry.address,
        role,
      })
    }
  }

  collect(addressList(parsed.from), 'from')
  collect(addressList(parsed.to), 'to')
  collect(addressList(parsed.cc), 'cc')

  return [...participants.values()]
}

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024

const buildAttachments = (parsed: ParsedMail): ProviderMessageAttachment[] | undefined => {
  if (!parsed.attachments || parsed.attachments.length === 0) {
    return undefined
  }

  const mapped = parsed.attachments
    .filter((attachment) => attachment.filename || attachment.contentDisposition === 'attachment')
    .map<ProviderMessageAttachment>((attachment) => {
      const size = typeof attachment.size === 'number' ? attachment.size : attachment.content?.length
      const content = Buffer.isBuffer(attachment.content) && (size ?? 0) <= MAX_ATTACHMENT_BYTES
        ? attachment.content
        : undefined

      return {
        externalAttachmentId: attachment.cid ?? attachment.contentId ?? attachment.checksum,
        fileName: attachment.filename ?? 'piece-jointe',
        mimeType: attachment.contentType ?? 'application/octet-stream',
        byteSize: size,
        content,
      }
    })

  return mapped.length > 0 ? mapped : undefined
}

const isTrackingUrl = (url: string): boolean => {
  if (!/^https?:\/\//i.test(url)) {
    return false
  }
  if (url.length > 120) {
    return true
  }
  return /\/(c|click|r|track|email|open|t|u|e)\/[^\/]{10,}/i.test(url)
}

const cleanWhitespace = (value: string): string =>
  value
    .replace(/[   ]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')

const buildTextFromHtml = (html: string): string => {
  try {
    const converted = htmlToText(html, {
      wordwrap: 110,
      preserveNewlines: false,
      selectors: [
        { selector: 'img', format: 'skip' },
        { selector: 'style', format: 'skip' },
        { selector: 'script', format: 'skip' },
        { selector: 'head', format: 'skip' },
        { selector: 'title', format: 'skip' },
        { selector: 'a', format: 'anchorWithFilter' },
      ],
      formatters: {
        anchorWithFilter: (elem, walk, builder) => {
          const href = String(elem.attribs?.href ?? '')
          walk(elem.children ?? [], builder)
          if (href && !isTrackingUrl(href)) {
            builder.addLiteral(` (${href})`)
          }
        },
      },
    })
    return cleanWhitespace(converted)
  } catch {
    return ''
  }
}

const bodyTextFrom = (parsed: ParsedMail): { plain?: string; html?: string } => {
  const html = typeof parsed.html === 'string' && parsed.html.length > 0 ? parsed.html : undefined
  const rawText = typeof parsed.text === 'string' ? parsed.text : ''

  let plain: string | undefined
  if (html) {
    plain = buildTextFromHtml(html) || cleanWhitespace(rawText) || undefined
  } else if (rawText.length > 0) {
    plain = cleanWhitespace(rawText)
  }

  return {
    plain: plain && plain.length > 0 ? plain : undefined,
    html,
  }
}

const tlsOptions = (server: MailServerSettings) => ({
  rejectUnauthorized: true,
  servername: server.host,
})

const buildImapClient = (server: MailServerSettings, password: string): ImapFlow =>
  new ImapFlow({
    host: server.host,
    port: server.port,
    secure: server.socketType === 'SSL',
    auth: { user: server.username, pass: password },
    logger: false,
    tls: tlsOptions(server),
    disableAutoIdle: true,
  })

const buildSmtpTransport = (server: MailServerSettings, password: string): Transporter =>
  nodemailer.createTransport({
    host: server.host,
    port: server.port,
    secure: server.socketType === 'SSL',
    requireTLS: server.socketType === 'STARTTLS',
    auth: { user: server.username, pass: password },
    tls: tlsOptions(server),
  })

type Channel = 'reception' | 'envoi'

interface MailErrorPayload {
  authenticationFailed?: boolean
  code?: string
  command?: string
  message?: string
  response?: string
  responseStatus?: string
  responseText?: string
  responseCode?: number
}

const appPasswordHint = (username: string): string | undefined => {
  const lower = username.toLowerCase()
  if (/gmail\.com|googlemail\.com/.test(lower)) {
    return "Gmail demande un mot de passe d'application : https://myaccount.google.com/apppasswords"
  }
  if (/icloud\.com|me\.com|mac\.com/.test(lower)) {
    return "iCloud demande un mot de passe pour app : https://appleid.apple.com (Securite)"
  }
  if (/outlook\.|hotmail\.|live\.|msn\./.test(lower)) {
    return "Outlook demande un mot de passe d'application si la verification en deux etapes est active."
  }
  if (/yahoo\./.test(lower)) {
    return "Yahoo demande un mot de passe d'application : Compte > Securite du compte > Generer un mot de passe."
  }
  return undefined
}

const channelLabel = (channel: Channel): string =>
  channel === 'reception' ? 'la reception des mails' : "l'envoi des mails"

const channelServerLabel = (channel: Channel): string =>
  channel === 'reception' ? 'serveur de reception (IMAP)' : "serveur d'envoi (SMTP)"

const describeMailError = (
  error: unknown,
  server: MailServerSettings,
  channel: Channel,
): string => {
  const candidate = (error ?? {}) as MailErrorPayload
  const code = candidate.code
  const responseText =
    (candidate.responseText && candidate.responseText.trim())
    || (candidate.response && candidate.response.trim())

  const verifyHostHint = `Verifiez que l'adresse "${server.host}" est correcte.`
  const verifyPortHint = `Verifiez le port ${server.port} et le mode de chiffrement.`

  switch (code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return `Impossible de trouver ${channelServerLabel(channel)}. ${verifyHostHint} Verifiez aussi votre connexion internet.`
    case 'ECONNREFUSED':
      return `${channelServerLabel(channel)} refuse la connexion. ${verifyPortHint}`
    case 'ETIMEDOUT':
    case 'ESOCKETTIMEDOUT':
      return `${channelServerLabel(channel)} ne repond pas. Verifiez votre connexion internet, ou que le port ${server.port} n'est pas bloque par un pare-feu.`
    case 'ECONNRESET':
      return `La connexion vers ${channelServerLabel(channel)} a ete coupee. Reessayez dans un instant.`
    case 'EPROTO':
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
    case 'CERT_HAS_EXPIRED':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
      return `Le certificat de securite de ${server.host} pose probleme. Verifiez le mode de chiffrement (SSL/TLS ou STARTTLS) et le port.`
    case 'ESOCKET':
      return `La negociation securisee avec ${server.host} a echoue. ${verifyPortHint}`
  }

  const isAuth = isAuthErrorPayload(error)
  if (isAuth) {
    const hint = appPasswordHint(server.username) ?? "Verifiez votre mot de passe et que l'acces IMAP/SMTP est autorise dans votre messagerie."
    return `Identifiant ou mot de passe refuse pour ${channelLabel(channel)}. ${hint}`
  }

  if (responseText) {
    return `${channelServerLabel(channel)} a refuse : ${responseText}`
  }

  if (candidate.message && candidate.message !== 'Command failed') {
    return `${channelServerLabel(channel)} a renvoye une erreur : ${candidate.message}`
  }

  return `Connexion impossible a ${channelServerLabel(channel)} (${server.host}:${server.port}).`
}

const isAuthErrorPayload = (error: unknown): boolean => {
  const candidate = (error ?? {}) as MailErrorPayload
  if (candidate.authenticationFailed) {
    return true
  }
  if (candidate.code === 'EAUTH') {
    return true
  }
  const text =
    `${candidate.message ?? ''} ${candidate.responseText ?? ''} ${candidate.response ?? ''}`.toLowerCase()
  return /\bauth(entication)?\b|credentials|invalid login|invalid user|invalid password|password.*(rejected|incorrect)|access denied|access refused|not permitted/.test(
    text,
  )
}

const withImap = async <T>(
  server: MailServerSettings,
  password: string,
  action: (client: ImapFlow) => Promise<T>,
): Promise<T> => {
  const client = buildImapClient(server, password)
  try {
    await client.connect()
    return await action(client)
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }
    logger.error('IMAP operation failed', { host: server.host, port: server.port, error })
    const code = isAuthErrorPayload(error) ? 'AUTH_REQUIRED' : 'PROVIDER_UNAVAILABLE'
    throw new AppError(code, describeMailError(error, server, 'reception'))
  } finally {
    try {
      await client.logout()
    } catch {
      // Ignored on shutdown.
    }
  }
}

const envelopeAddressList = (
  entries: Array<{ name?: string; address?: string }> | undefined,
): Array<{ name?: string; address?: string }> => {
  if (!entries) return []
  return entries.map((entry) => ({ name: entry.name, address: entry.address }))
}

const buildParticipantsFromEnvelope = (
  envelope: FetchMessageObject['envelope'],
): ProviderConversationParticipant[] => {
  if (!envelope) return []
  const participants = new Map<string, ProviderConversationParticipant>()

  const collect = (entries: Array<{ name?: string; address?: string }>, role: string): void => {
    for (const entry of entries) {
      const key = (entry.address ?? entry.name ?? '').toLowerCase().trim()
      if (!key || participants.has(key)) continue
      participants.set(key, {
        externalParticipantId: entry.address ?? entry.name,
        displayName: entry.name,
        address: entry.address,
        role,
      })
    }
  }

  collect(envelopeAddressList(envelope.from), 'from')
  collect(envelopeAddressList(envelope.to), 'to')
  collect(envelopeAddressList(envelope.cc), 'cc')

  return [...participants.values()]
}

type FolderMessageRecord = ProviderMessageRecord

const mergeConversation = (
  conversations: Map<string, ProviderConversationRecord>,
  threadRoot: string,
  patch: ProviderConversationRecord,
  participants: ProviderConversationParticipant[],
  isUnread: boolean,
): void => {
  const existing = conversations.get(threadRoot)
  if (!existing) {
    conversations.set(threadRoot, {
      ...patch,
      unreadCount: isUnread ? 1 : 0,
      participants,
    })
    return
  }

  if ((patch.lastMessageAt ?? '') > (existing.lastMessageAt ?? '')) {
    existing.lastMessageAt = patch.lastMessageAt
    if (patch.lastMessagePreview !== undefined) {
      existing.lastMessagePreview = patch.lastMessagePreview
    }
  }
  existing.unreadCount = (existing.unreadCount ?? 0) + (isUnread ? 1 : 0)

  const knownKeys = new Set(
    (existing.participants ?? []).map((participant) =>
      (participant.address ?? participant.displayName ?? '').toLowerCase(),
    ),
  )
  for (const participant of participants) {
    const key = (participant.address ?? participant.displayName ?? '').toLowerCase()
    if (!knownKeys.has(key)) {
      existing.participants = [...(existing.participants ?? []), participant]
      knownKeys.add(key)
    }
  }
}

interface ParsedFetched {
  record: ProviderMessageRecord
  conversation: ProviderConversationRecord
  participants: ProviderConversationParticipant[]
  threadRoot: string
  isUnread: boolean
}

const parseFetchedMessage = async (
  message: FetchMessageObject,
  accountEmailLower: string,
  folderPath: string,
): Promise<ParsedFetched | undefined> => {
  const source = message.source
  if (!source) {
    return undefined
  }

  let parsed: ParsedMail
  try {
    parsed = await simpleParser(source)
  } catch (error) {
    logger.warn?.('Failed to parse IMAP message', {
      uid: message.uid,
      error: (error as Error).message,
    })
    return undefined
  }

  const envelope = message.envelope
  const messageId = envelope?.messageId ?? parsed.messageId
  const references = parseReferences(parsed.references ?? parsed.headers.get('references'))
  const inReplyTo = parseReferences(parsed.inReplyTo ?? parsed.headers.get('in-reply-to'))
  const threadRoot = threadRootFromHeaders(messageId, references, inReplyTo)

  const subject = envelope?.subject ?? parsed.subject ?? undefined
  const normalizedSubject = normalizeSubject(subject)
  const fromEntries = addressList(parsed.from)
  const fromMain = firstAddress(fromEntries)
  const toEntries = addressList(parsed.to)
  const fromAddress = fromMain?.address?.toLowerCase()
  const isOutgoing = fromAddress === accountEmailLower

  const dateValue = envelope?.date ?? parsed.date ?? message.internalDate
  const sentAt = dateValue
    ? dateValue instanceof Date ? dateValue.toISOString() : new Date(dateValue).toISOString()
    : undefined
  const flags = message.flags ?? new Set<string>()
  const isUnread = !flags.has('\\Seen')

  const { plain, html } = bodyTextFrom(parsed)
  const preview = buildTextPreview(plain ?? html?.replace(/<[^>]+>/g, ' '), 280)
  const externalMessageId = messageId ?? `uid:${message.uid}`

  const record: ProviderMessageRecord = {
    externalMessageId,
    conversationExternalId: threadRoot,
    direction: isOutgoing ? 'outgoing' : 'incoming',
    senderName: fromMain?.name ?? fromMain?.address,
    senderAddress: fromMain?.address,
    bodyPlain: plain,
    bodyHtml: html,
    bodyPreview: preview,
    bodyTokens: undefined,
    receivedAt: isOutgoing ? undefined : sentAt,
    sentAt,
    mentionsCurrentUser: !isOutgoing
      && toEntries.some((entry) => entry.address?.toLowerCase() === accountEmailLower),
    attachments: buildAttachments(parsed),
    isUnread,
    externalUid: message.uid,
    folderPath,
  }

  const conversation: ProviderConversationRecord = {
    externalConversationId: threadRoot,
    title: normalizedSubject,
    kind: 'mail',
    subject,
    lastMessageAt: sentAt,
    lastMessagePreview: preview,
    unreadCount: 0,
    isMuted: false,
  }

  return {
    record,
    conversation,
    participants: buildParticipants(parsed),
    threadRoot,
    isUnread,
  }
}

const messageRecordsFromFolder = async (
  client: ImapFlow,
  accountEmail: string,
  folderPath: string,
  isMessageKnown?: (externalMessageId: string) => boolean,
): Promise<{
  conversations: Map<string, ProviderConversationRecord>
  messages: FolderMessageRecord[]
}> => {
  const conversations = new Map<string, ProviderConversationRecord>()
  const messages: FolderMessageRecord[] = []

  const lock = await client.getMailboxLock(folderPath)

  try {
    const status = await client.status(folderPath, { messages: true })
    const total = status.messages ?? 0
    if (total === 0) {
      return { conversations, messages }
    }

    const start = Math.max(1, total - INBOX_FETCH_LIMIT + 1)
    const range = `${start}:${total}`

    const headers: FetchMessageObject[] = []
    for await (const item of client.fetch(
      range,
      { uid: true, envelope: true, flags: true, internalDate: true },
      { uid: false },
    )) {
      headers.push(item)
    }

    const unknownUids: number[] = []
    const accountEmailLower = accountEmail.toLowerCase()

    for (const header of headers) {
      const envelope = header.envelope
      const externalMessageId = envelope?.messageId ?? `uid:${header.uid}`

      if (isMessageKnown?.(externalMessageId)) {
        const fromEntries = envelopeAddressList(envelope?.from)
        const fromMain = firstAddress(fromEntries)
        const toEntries = envelopeAddressList(envelope?.to)
        const fromAddress = fromMain?.address?.toLowerCase()
        const isOutgoing = fromAddress === accountEmailLower
        const dateValue = envelope?.date ?? header.internalDate
        const sentAt = dateValue
          ? dateValue instanceof Date ? dateValue.toISOString() : new Date(dateValue).toISOString()
          : undefined
        const subject = envelope?.subject ?? undefined
        const normalizedSubject = normalizeSubject(subject)
        const references = parseReferences(envelope?.inReplyTo)
        const threadRoot = threadRootFromHeaders(envelope?.messageId, references, references)
        const flags = header.flags ?? new Set<string>()
        const isUnread = !flags.has('\\Seen')

        messages.push({
          externalMessageId,
          conversationExternalId: threadRoot,
          direction: isOutgoing ? 'outgoing' : 'incoming',
          senderName: fromMain?.name ?? fromMain?.address,
          senderAddress: fromMain?.address,
          receivedAt: isOutgoing ? undefined : sentAt,
          sentAt,
          mentionsCurrentUser: !isOutgoing
            && toEntries.some((entry) => entry.address?.toLowerCase() === accountEmailLower),
          envelopeOnly: true,
          isUnread,
          externalUid: header.uid,
          folderPath,
        })

        mergeConversation(
          conversations,
          threadRoot,
          {
            externalConversationId: threadRoot,
            title: normalizedSubject,
            kind: 'mail',
            subject,
            lastMessageAt: sentAt,
            unreadCount: 0,
            isMuted: false,
          },
          buildParticipantsFromEnvelope(envelope),
          isUnread,
        )
        continue
      }

      unknownUids.push(header.uid)
    }

    if (unknownUids.length === 0) {
      return { conversations, messages }
    }

    const sourceFetched: FetchMessageObject[] = []
    for await (const item of client.fetch(
      unknownUids,
      { uid: true, envelope: true, flags: true, source: true, internalDate: true },
      { uid: true },
    )) {
      sourceFetched.push(item)
    }

    for (const message of sourceFetched) {
      const parsedResult = await parseFetchedMessage(
        message,
        accountEmailLower,
        folderPath,
      )
      if (!parsedResult) continue

      messages.push(parsedResult.record)
      mergeConversation(
        conversations,
        parsedResult.threadRoot,
        parsedResult.conversation,
        parsedResult.participants,
        parsedResult.isUnread,
      )
    }
  } finally {
    lock.release()
  }

  return { conversations, messages }
}

interface FolderSnapshot {
  conversations: Map<string, ProviderConversationRecord>
  messages: FolderMessageRecord[]
}

export class ImapProvider extends PlaceholderProvider {
  readonly descriptor = {
    id: 'imap',
    name: 'imap',
    displayName: 'IMAP / SMTP',
    capabilities: [
      'password-auth',
      'sync-conversations',
      'sync-messages',
      'send-message',
      'attachments',
      'notifications',
    ],
    authReady: true,
  } as const

  private readonly snapshotCache = new WeakMap<ProviderRuntimeContext, Promise<FolderSnapshot>>()

  private fetchFolderSnapshot(context: ProviderRuntimeContext): Promise<FolderSnapshot> {
    const cached = this.snapshotCache.get(context)
    if (cached) {
      return cached
    }

    const settings = parseImapAccountSettings(context.settings)
    if (!settings) {
      return Promise.reject(
        new AppError(
          'PROVIDER_UNAVAILABLE',
          "Les reglages de ce compte sont incomplets. Reconnectez-le depuis Ajouter un compte.",
        ),
      )
    }

    const folderPath = selectedFolder(context.settings)
    const password = context.credentials.accessToken
    const promise = withImap(settings.imap, password, (client) =>
      messageRecordsFromFolder(client, settings.emailAddress, folderPath, context.isMessageKnown),
    )
    this.snapshotCache.set(context, promise)
    return promise
  }

  async verifyCredentials(
    settings: { imap: MailServerSettings; smtp: MailServerSettings },
    password: string,
  ): Promise<void> {
    await withImap(settings.imap, password, async (client) => {
      await client.noop()
    })

    const transport = buildSmtpTransport(settings.smtp, password)
    try {
      await transport.verify()
    } catch (error) {
      logger.error('SMTP verify failed', { host: settings.smtp.host, port: settings.smtp.port, error })
      throw new AppError(
        isAuthErrorPayload(error) ? 'AUTH_REQUIRED' : 'PROVIDER_UNAVAILABLE',
        describeMailError(error, settings.smtp, 'envoi'),
      )
    } finally {
      transport.close()
    }
  }

  async syncConversations(
    context: ProviderRuntimeContext,
  ): Promise<ProviderSyncResult<ProviderConversationRecord>> {
    const { conversations } = await this.fetchFolderSnapshot(context)

    return {
      items: [...conversations.values()].sort((left, right) =>
        (right.lastMessageAt ?? '').localeCompare(left.lastMessageAt ?? ''),
      ),
      cursors: [],
    }
  }

  async syncMessages(
    context: ProviderRuntimeContext,
  ): Promise<ProviderSyncResult<ProviderMessageRecord>> {
    const { messages } = await this.fetchFolderSnapshot(context)

    return {
      items: messages,
      cursors: [],
    }
  }

  async listFolders(
    context: ProviderRuntimeContext,
  ): Promise<MailFolderSummary[]> {
    const settings = parseImapAccountSettings(context.settings)
    if (!settings) {
      throw new AppError('PROVIDER_UNAVAILABLE', "Les reglages de ce compte sont incomplets. Reconnectez-le depuis Ajouter un compte.")
    }

    const password = context.credentials.accessToken
    return withImap(settings.imap, password, async (client) => {
      const list = await client.list({ statusQuery: { messages: true, unseen: true } })
      const folders: MailFolderSummary[] = []
      for (const entry of list) {
        if (entry.subscribed === false && entry.path !== 'INBOX') {
          continue
        }
        folders.push({
          path: entry.path,
          name: entry.name ?? entry.path,
          role: detectFolderRole(entry.path, entry.specialUse, entry.flags),
          delimiter: entry.delimiter,
          unreadCount: entry.status?.unseen,
          totalCount: entry.status?.messages,
        })
      }
      return sortFolders(folders)
    })
  }

  async deleteMessages(
    context: ProviderRuntimeContext,
    folderPath: string,
    uids: number[],
  ): Promise<void> {
    if (uids.length === 0) return
    const settings = parseImapAccountSettings(context.settings)
    if (!settings) {
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        "Les reglages de ce compte sont incomplets. Reconnectez-le depuis Ajouter un compte.",
      )
    }

    const password = context.credentials.accessToken
    await withImap(settings.imap, password, async (client) => {
      const lock = await client.getMailboxLock(folderPath)
      try {
        await client.messageDelete(uids, { uid: true })
      } finally {
        lock.release()
      }
    })
  }

  async moveMessages(
    context: ProviderRuntimeContext,
    fromFolder: string,
    toFolder: string,
    uids: number[],
  ): Promise<void> {
    if (uids.length === 0 || fromFolder === toFolder) return
    const settings = parseImapAccountSettings(context.settings)
    if (!settings) {
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        "Les reglages de ce compte sont incomplets. Reconnectez-le depuis Ajouter un compte.",
      )
    }

    const password = context.credentials.accessToken
    await withImap(settings.imap, password, async (client) => {
      const lock = await client.getMailboxLock(fromFolder)
      try {
        await client.messageMove(uids, toFolder, { uid: true })
      } finally {
        lock.release()
      }
    })
  }

  async markMessagesRead(
    context: ProviderRuntimeContext,
    folderPath: string,
    uids: number[],
    read: boolean,
  ): Promise<void> {
    if (uids.length === 0) {
      return
    }

    const settings = parseImapAccountSettings(context.settings)
    if (!settings) {
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        "Les reglages de ce compte sont incomplets. Reconnectez-le depuis Ajouter un compte.",
      )
    }

    const password = context.credentials.accessToken
    await withImap(settings.imap, password, async (client) => {
      const lock = await client.getMailboxLock(folderPath)
      try {
        if (read) {
          await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true })
        } else {
          await client.messageFlagsRemove(uids, ['\\Seen'], { uid: true })
        }
      } finally {
        lock.release()
      }
    })
  }

  async loadOlderMessages(
    context: ProviderRuntimeContext,
    folderPath: string,
    beforeUid: number | undefined,
    limit: number,
  ): Promise<ProviderMessageRecord[]> {
    const settings = parseImapAccountSettings(context.settings)
    if (!settings) {
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        "Les reglages de ce compte sont incomplets. Reconnectez-le depuis Ajouter un compte.",
      )
    }

    const password = context.credentials.accessToken
    const accountEmailLower = settings.emailAddress.toLowerCase()
    return withImap(settings.imap, password, async (client) => {
      const lock = await client.getMailboxLock(folderPath)
      try {
        const range = typeof beforeUid === 'number' && beforeUid > 1
          ? `1:${beforeUid - 1}`
          : '1:*'
        const found: FetchMessageObject[] = []
        for await (const item of client.fetch(
          range,
          { uid: true, envelope: true, flags: true, source: true, internalDate: true },
          { uid: true },
        )) {
          found.push(item)
        }
        const sorted = found.sort((left, right) => (right.uid ?? 0) - (left.uid ?? 0))
        const picked = sorted.slice(0, limit)

        const records: ProviderMessageRecord[] = []
        for (const message of picked) {
          const parsed = await parseFetchedMessage(message, accountEmailLower, folderPath)
          if (parsed) {
            records.push(parsed.record)
          }
        }
        return records
      } finally {
        lock.release()
      }
    })
  }

  async sendMessage(
    context: ProviderRuntimeContext,
    input: SendMessageInput,
  ): Promise<SendMessageResult> {
    const settings = parseImapAccountSettings(context.settings)
    if (!settings) {
      throw new AppError('PROVIDER_UNAVAILABLE', "Les reglages de ce compte sont incomplets. Reconnectez-le depuis Ajouter un compte.")
    }

    const recipients = (input.recipients ?? []).filter((entry) => entry.includes('@'))
    if (recipients.length === 0) {
      throw new AppError(
        'VALIDATION_FAILED',
        "Aucun destinataire n'a pu etre identifie pour cette conversation.",
      )
    }

    const password = context.credentials.accessToken
    const baseSubject = input.subject?.trim() || 'Sans objet'
    const subject = /^re\s*:/i.test(baseSubject) ? baseSubject : `Re: ${baseSubject}`
    const inReplyTo = input.inReplyTo ?? input.externalConversationId
    const references = input.references && input.references.length > 0
      ? input.references
      : [input.externalConversationId]

    const displayName = typeof context.settings.displayName === 'string'
      ? (context.settings.displayName as string)
      : undefined

    const attachments = (input.attachments ?? []).map<{ filename: string; content: Buffer; contentType?: string }>(
      (attachment: OutgoingAttachmentInput) => ({
        filename: attachment.fileName,
        content: attachment.bytes,
        contentType: attachment.mimeType,
      }),
    )

    const transport = buildSmtpTransport(settings.smtp, password)
    const fromAddress = displayName
      ? { name: displayName, address: settings.emailAddress }
      : settings.emailAddress

    try {
      const info = (await transport.sendMail({
        from: fromAddress,
        to: recipients,
        subject,
        text: input.body,
        inReplyTo,
        references,
        attachments,
      })) as { messageId?: string }

      return {
        externalMessageId: info.messageId ?? `smtp:${Date.now()}`,
        attachments: attachments.map((entry) => ({
          fileName: entry.filename,
          mimeType: entry.contentType,
          byteSize: Buffer.isBuffer(entry.content) ? entry.content.byteLength : undefined,
        })),
      }
    } catch (error) {
      logger.error('SMTP sendMail failed', { host: settings.smtp.host, error })
      throw new AppError(
        isAuthErrorPayload(error) ? 'AUTH_REQUIRED' : 'PROVIDER_UNAVAILABLE',
        describeMailError(error, settings.smtp, 'envoi'),
      )
    } finally {
      transport.close()
    }
  }

  async composeNew(
    context: ProviderRuntimeContext,
    input: {
      to: string[]
      cc?: string[]
      bcc?: string[]
      subject: string
      body: string
      attachments?: OutgoingAttachmentInput[]
    },
  ): Promise<{ externalMessageId: string }> {
    const settings = parseImapAccountSettings(context.settings)
    if (!settings) {
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        "Les reglages de ce compte sont incomplets. Reconnectez-le depuis Ajouter un compte.",
      )
    }

    const to = input.to.map((entry) => entry.trim()).filter((entry) => entry.includes('@'))
    if (to.length === 0) {
      throw new AppError('VALIDATION_FAILED', "Indiquez au moins un destinataire valide.")
    }
    const cc = (input.cc ?? []).map((entry) => entry.trim()).filter((entry) => entry.includes('@'))
    const bcc = (input.bcc ?? []).map((entry) => entry.trim()).filter((entry) => entry.includes('@'))

    const subject = input.subject.trim().length > 0 ? input.subject.trim() : 'Sans objet'
    const displayName = typeof context.settings.displayName === 'string'
      ? (context.settings.displayName as string)
      : undefined
    const fromAddress = displayName
      ? { name: displayName, address: settings.emailAddress }
      : settings.emailAddress

    const attachments = (input.attachments ?? []).map<{ filename: string; content: Buffer; contentType?: string }>(
      (attachment) => ({
        filename: attachment.fileName,
        content: attachment.bytes,
        contentType: attachment.mimeType,
      }),
    )

    const password = context.credentials.accessToken
    const transport = buildSmtpTransport(settings.smtp, password)
    try {
      const info = (await transport.sendMail({
        from: fromAddress,
        to,
        cc: cc.length > 0 ? cc : undefined,
        bcc: bcc.length > 0 ? bcc : undefined,
        subject,
        text: input.body,
        attachments,
      })) as { messageId?: string }
      return { externalMessageId: info.messageId ?? `smtp:${Date.now()}` }
    } catch (error) {
      logger.error('SMTP composeNew failed', { host: settings.smtp.host, error })
      throw new AppError(
        isAuthErrorPayload(error) ? 'AUTH_REQUIRED' : 'PROVIDER_UNAVAILABLE',
        describeMailError(error, settings.smtp, 'envoi'),
      )
    } finally {
      transport.close()
    }
  }
}

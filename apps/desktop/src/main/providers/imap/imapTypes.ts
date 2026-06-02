import type { MailServerSettings } from '@shared/models'

export interface ImapAccountSettings {
  emailAddress: string
  imap: MailServerSettings
  smtp: MailServerSettings
}

export const parseImapAccountSettings = (
  settings: Record<string, unknown>,
): ImapAccountSettings | undefined => {
  const emailAddress = settings.emailAddress
  const imap = settings.imap
  const smtp = settings.smtp

  if (typeof emailAddress !== 'string' || !isMailServer(imap) || !isMailServer(smtp)) {
    return undefined
  }

  return {
    emailAddress,
    imap,
    smtp,
  }
}

const isMailServer = (value: unknown): value is MailServerSettings => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<MailServerSettings>
  return (
    typeof candidate.host === 'string'
    && candidate.host.length > 0
    && typeof candidate.port === 'number'
    && (candidate.socketType === 'SSL'
      || candidate.socketType === 'STARTTLS'
      || candidate.socketType === 'plain')
    && typeof candidate.username === 'string'
    && candidate.username.length > 0
  )
}

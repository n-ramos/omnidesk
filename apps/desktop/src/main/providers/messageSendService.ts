import { Buffer } from 'node:buffer'
import type { Database } from 'better-sqlite3'
import { AppError } from '@shared/errors'
import type { MessageSummary, OutgoingAttachment, SendMessageRequest } from '@shared/models'
import { AccountRepository } from '@main/database/repositories/accountRepository'
import { ConversationRepository } from '@main/database/repositories/conversationRepository'
import { MessageRepository } from '@main/database/repositories/messageRepository'
import { tokenVault } from '@main/security/tokenVault'
import type { OutgoingAttachmentInput } from './provider.types'
import { providerRegistry } from './providerRegistry'

const decodeAttachment = (attachment: OutgoingAttachment): OutgoingAttachmentInput => {
  const fileName = attachment.fileName.trim()
  if (!fileName) {
    throw new AppError('VALIDATION_FAILED', "Le nom du fichier est requis.")
  }

  const bytes = Buffer.from(attachment.bytesBase64, 'base64')
  if (bytes.length === 0) {
    throw new AppError('VALIDATION_FAILED', `Le fichier ${fileName} est vide.`)
  }

  return {
    fileName,
    mimeType: attachment.mimeType || 'application/octet-stream',
    byteSize: attachment.byteSize > 0 ? attachment.byteSize : bytes.length,
    bytes,
  }
}

export class MessageSendService {
  private readonly accounts: AccountRepository
  private readonly conversations: ConversationRepository
  private readonly messages: MessageRepository

  constructor(db: Database) {
    this.accounts = new AccountRepository(db)
    this.conversations = new ConversationRepository(db)
    this.messages = new MessageRepository(db)
  }

  async send(request: SendMessageRequest): Promise<MessageSummary> {
    const ref = this.conversations.getProviderRef(request.conversationId)
    if (!ref) {
      throw new AppError('DATABASE_ERROR', "Cette conversation est introuvable.")
    }

    const account = this.accounts.get(ref.accountId)
    if (!account) {
      throw new AppError('DATABASE_ERROR', "Le compte associe a cette conversation est introuvable.")
    }

    const provider = providerRegistry.get(account.providerId)
    if (!provider) {
      throw new AppError('PROVIDER_UNAVAILABLE', "Ce service n'est pas disponible pour l'envoi.")
    }

    const accessToken = await tokenVault.getToken(account.providerId, account.id, 'access')
    if (!accessToken) {
      throw new AppError('AUTH_REQUIRED', "Reconnectez ce compte avant d'envoyer un message.")
    }

    const refreshToken = await tokenVault.getToken(account.providerId, account.id, 'refresh')

    const decodedAttachments =
      request.attachments && request.attachments.length > 0
        ? request.attachments.map(decodeAttachment)
        : undefined

    const replyContext = account.providerId === 'imap'
      ? this.conversations.getReplyContext(request.conversationId)
      : null

    if (account.providerId === 'imap' && (!replyContext || replyContext.recipients.length === 0)) {
      throw new AppError(
        'VALIDATION_FAILED',
        "Aucun destinataire n'a pu etre identifie pour cette conversation.",
      )
    }

    const result = await provider.sendMessage(
      {
        accountId: account.id,
        providerId: account.providerId,
        externalAccountId: account.externalAccountId,
        settings: account.settings,
        credentials: {
          accessToken,
          refreshToken: refreshToken ?? undefined,
        },
        onCredentialsRefreshed: async (credentials) => {
          await tokenVault.setToken(
            account.providerId,
            account.id,
            'access',
            credentials.accessToken,
          )
          if (credentials.refreshToken) {
            await tokenVault.setToken(
              account.providerId,
              account.id,
              'refresh',
              credentials.refreshToken,
            )
          }
        },
      },
      {
        accountId: account.id,
        conversationId: request.conversationId,
        externalConversationId: ref.externalConversationId,
        body: request.body,
        attachments: decodedAttachments,
        subject: replyContext?.subject,
        recipients: replyContext?.recipients.filter(
          (entry) => entry.toLowerCase() !== (account.emailAddress ?? '').toLowerCase(),
        ),
        inReplyTo: replyContext?.lastExternalMessageId,
        references: replyContext?.references,
      },
    )

    const persistedAttachments = result.attachments?.map((attachment, index) => {
      const original = decodedAttachments?.[index]
      return original
        ? { ...attachment, content: original.bytes }
        : attachment
    })

    return this.messages.insertOutgoing({
      accountId: account.id,
      providerId: account.providerId,
      conversationId: request.conversationId,
      externalMessageId: result.externalMessageId,
      body: request.body,
      senderName: account.displayName ?? account.label,
      senderAddress: account.emailAddress ?? account.externalAccountId,
      sentAt: new Date().toISOString(),
      attachments: persistedAttachments,
    })
  }
}

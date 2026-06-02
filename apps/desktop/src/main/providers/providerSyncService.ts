import type { Database } from 'better-sqlite3'
import { AppError } from '@shared/errors'
import { AccountRepository, type AccountRecord } from '@main/database/repositories/accountRepository'
import { ConversationRepository } from '@main/database/repositories/conversationRepository'
import { MessageRepository } from '@main/database/repositories/messageRepository'
import { NotificationRepository } from '@main/database/repositories/notificationRepository'
import { eventBus } from '@main/events/eventBus'
import { providerRegistry } from './providerRegistry'
import { tokenVault } from '@main/security/tokenVault'
import type {
  ProviderConversationRecord,
  ProviderCredentials,
  ProviderMessageRecord,
  ProviderRuntimeContext,
  ProviderSyncResult,
} from './provider.types'

const previewBody = (value?: string): string | undefined => {
  if (!value) {
    return undefined
  }

  const compact = value.replace(/\s+/g, ' ').trim()
  return compact ? compact.slice(0, 160) : undefined
}

const resolveSelfExternalUserId = (settings: Record<string, unknown>): string | undefined => {
  const value = settings.installerUserId
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

const readNotificationWaterMark = (settings: Record<string, unknown>): string | undefined => {
  const value = settings.notificationHighWaterAt
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export class ProviderSyncService {
  private readonly accounts: AccountRepository
  private readonly conversations: ConversationRepository
  private readonly messages: MessageRepository
  private readonly notifications: NotificationRepository

  constructor(db: Database) {
    this.accounts = new AccountRepository(db)
    this.conversations = new ConversationRepository(db)
    this.messages = new MessageRepository(db)
    this.notifications = new NotificationRepository(db)
  }

  async syncFocusedConversation(
    conversationId: string,
  ): Promise<{ messages: number } | undefined> {
    const ref = this.conversations.getProviderRef(conversationId)
    if (!ref) {
      return undefined
    }

    const account = this.accounts.get(ref.accountId)
    if (!account) {
      return undefined
    }

    const provider = providerRegistry.get(account.providerId)
    if (!provider?.syncFocusedConversation) {
      return undefined
    }

    const context = await this.buildContext(account)
    if (!context) {
      return undefined
    }

    const synced = await provider.syncFocusedConversation(context, ref.externalConversationId)
    const conversationIdsByExternalId = new Map<string, string>()
    conversationIdsByExternalId.set(ref.externalConversationId, conversationId)

    const { insertedMessages } = this.messages.upsertForAccount(
      account.id,
      account.providerId,
      synced.items,
      conversationIdsByExternalId,
      { selfExternalUserId: resolveSelfExternalUserId(account.settings) },
    )

    if (insertedMessages.length > 0) {
      const syntheticConversation: ProviderConversationRecord = {
        externalConversationId: ref.externalConversationId,
        title: ref.title,
        kind: ref.kind,
        unreadCount: 0,
        isMuted: false,
      }

      this.emitMentionNotifications(
        account,
        [syntheticConversation],
        insertedMessages,
        conversationIdsByExternalId,
      )
    }

    return { messages: synced.items.length }
  }

  async syncAccount(accountId: string): Promise<{ conversations: number; messages: number }> {
    const account = this.accounts.get(accountId)
    if (!account) {
      throw new AppError('DATABASE_ERROR', "Impossible de retrouver ce compte pour la synchro.")
    }

    const provider = providerRegistry.get(account.providerId)
    if (!provider) {
      throw new AppError('PROVIDER_UNAVAILABLE', "Le service demande n'est pas disponible.")
    }

    const context = await this.buildContext(account)
    if (!context) {
      this.flagReauthRequired(account, 'missing_token')
      throw new AppError('AUTH_REQUIRED', 'Ce compte doit etre reconnecte avant la synchro.')
    }

    const isFirstSync = !account.lastSyncAt
    const previousWaterMark = readNotificationWaterMark(account.settings)

    let syncedConversations: ProviderSyncResult<ProviderConversationRecord>
    let syncedMessages: ProviderSyncResult<ProviderMessageRecord>
    try {
      syncedConversations = await provider.syncConversations(context)
      syncedMessages = await provider.syncMessages(context)
    } catch (error) {
      if (error instanceof AppError && (error.code === 'AUTH_REQUIRED' || error.code === 'TOKEN_EXPIRED')) {
        this.flagReauthRequired(account, error.code === 'TOKEN_EXPIRED' ? 'token_expired' : 'auth_required')
      }
      throw error
    }

    const conversationIdsByExternalId = this.conversations.upsertForAccount(
      account.id,
      account.providerId,
      syncedConversations.items,
    )

    const { insertedMessages } = this.messages.upsertForAccount(
      account.id,
      account.providerId,
      syncedMessages.items,
      conversationIdsByExternalId,
      { selfExternalUserId: resolveSelfExternalUserId(account.settings) },
    )

    this.accounts.markSyncComplete(account.id)

    if (!isFirstSync && previousWaterMark) {
      const freshMessages = insertedMessages.filter((message) => {
        const timestamp = message.receivedAt ?? message.sentAt
        return Boolean(timestamp && timestamp > previousWaterMark)
      })
      if (freshMessages.length > 0) {
        this.emitMentionNotifications(
          account,
          syncedConversations.items,
          freshMessages,
          conversationIdsByExternalId,
        )
      }
    }

    this.advanceNotificationWaterMark(account.id, account.settings, insertedMessages, previousWaterMark)

    return {
      conversations: syncedConversations.items.length,
      messages: syncedMessages.items.length,
    }
  }

  private advanceNotificationWaterMark(
    accountId: string,
    settings: Record<string, unknown>,
    syncedMessages: ProviderMessageRecord[],
    previousWaterMark: string | undefined,
  ): void {
    const latest = syncedMessages.reduce<string | undefined>((acc, message) => {
      const timestamp = message.receivedAt ?? message.sentAt
      if (!timestamp) {
        return acc
      }
      return !acc || timestamp > acc ? timestamp : acc
    }, undefined)

    const nowIso = new Date().toISOString()
    const candidates = [previousWaterMark, latest, nowIso].filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    )
    if (candidates.length === 0) {
      return
    }
    const nextMark = candidates.reduce((acc, value) => (value > acc ? value : acc))

    if (nextMark === previousWaterMark) {
      return
    }

    this.accounts.updateSettings(accountId, {
      ...settings,
      notificationHighWaterAt: nextMark,
    })
  }

  private flagReauthRequired(
    account: AccountRecord,
    reason: 'token_expired' | 'auth_required' | 'missing_token',
  ): void {
    if (account.setupStatus === 'error') {
      return
    }

    this.accounts.markSetupStatusError(account.id)

    const body =
      reason === 'token_expired'
        ? "Le jeton a expire et n'a pas pu etre renouvele. Reconnectez ce compte pour reprendre la synchro."
        : reason === 'missing_token'
          ? "Aucun jeton n'est disponible pour ce compte. Reconnectez-le pour reprendre la synchro."
          : "Le service a invalide ce compte. Reconnectez-le pour reprendre la synchro."

    const notification = this.notifications.create({
      level: 'warning',
      providerId: account.providerId,
      accountId: account.id,
      title: `${account.label} demande une reconnexion`,
      body,
    })
    eventBus.emit('notification:created', notification)
  }

  private async buildContext(account: AccountRecord): Promise<ProviderRuntimeContext | undefined> {
    const accessToken = await tokenVault.getToken(account.providerId, account.id, 'access')
    if (!accessToken) {
      return undefined
    }

    const refreshToken = await tokenVault.getToken(account.providerId, account.id, 'refresh')

    return {
      accountId: account.id,
      providerId: account.providerId,
      externalAccountId: account.externalAccountId,
      settings: account.settings,
      credentials: {
        accessToken,
        refreshToken: refreshToken ?? undefined,
      },
      onCredentialsRefreshed: async (credentials: ProviderCredentials) => {
        await tokenVault.setToken(account.providerId, account.id, 'access', credentials.accessToken)
        if (credentials.refreshToken) {
          await tokenVault.setToken(
            account.providerId,
            account.id,
            'refresh',
            credentials.refreshToken,
          )
        }
      },
      isMessageKnown: (externalMessageId) =>
        this.messages.hasExternalMessage(account.id, account.providerId, externalMessageId),
    }
  }

  private emitMentionNotifications(
    account: AccountRecord,
    conversations: ProviderConversationRecord[],
    newMessages: ProviderMessageRecord[],
    conversationIdsByExternalId: Map<string, string>,
  ): void {
    if (newMessages.length === 0) {
      return
    }

    const conversationsByExternal = new Map<string, ProviderConversationRecord>()
    for (const conversation of conversations) {
      conversationsByExternal.set(conversation.externalConversationId, conversation)
    }

    for (const message of newMessages) {
      if (message.direction !== 'incoming') {
        continue
      }

      const conversation = conversationsByExternal.get(message.conversationExternalId)
      if (!conversation) {
        continue
      }

      const isDm = conversation.kind === 'dm'
      const isMention = message.mentionsCurrentUser === true

      if (!isDm && !isMention) {
        continue
      }

      const sender = message.senderName || message.senderAddress || 'Quelqu\'un'
      const title = isDm
        ? `${sender} vous a ecrit`
        : `${sender} vous mentionne dans ${conversation.title}`

      const notification = this.notifications.create({
        level: 'info',
        providerId: account.providerId,
        accountId: account.id,
        conversationId: conversationIdsByExternalId.get(message.conversationExternalId),
        title,
        body: previewBody(message.bodyPlain) ?? message.bodyPreview,
      })

      eventBus.emit('notification:created', notification)
    }
  }
}

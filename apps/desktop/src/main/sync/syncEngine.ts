import { databaseClient } from '@main/database/client'
import { appConfig } from '@main/config/env'
import { AppError } from '@shared/errors'
import { eventBus } from '@main/events/eventBus'
import { logger } from '@main/logger'
import { AccountRepository } from '@main/database/repositories/accountRepository'
import { ProviderSyncService } from '@main/providers/providerSyncService'
import type { ProviderKind } from '@shared/models'

const TICK_INTERVAL_MS = 3_000
const FOCUSED_INTERVAL_MS = 3_000

export class SyncEngine {
  private stopListening?: () => void
  private syncService?: ProviderSyncService
  private accounts?: AccountRepository
  private pollTimer?: NodeJS.Timeout
  private readonly inFlight = new Set<string>()
  private readonly lastSyncedAt = new Map<string, number>()
  private readonly intervalsMs: Partial<Record<ProviderKind, number>>
  private focusedConversationId?: string
  private lastFocusedSyncAt = 0
  private focusedInFlight = false

  constructor() {
    // Slack/Teams sont passes en mode web (comptes "webpage", pas de sync API).
    this.intervalsMs = {
      imap: appConfig.OMNIDESK_SYNC_INTERVAL_IMAP_SECONDS * 1000,
    }
  }

  start(): void {
    const db = databaseClient.open()
    this.syncService = new ProviderSyncService(db)
    this.accounts = new AccountRepository(db)

    this.stopListening = eventBus.on('sync:requested', ({ accountId }) => {
      void this.runSync(accountId)
    })

    this.pollTimer = setInterval(() => {
      this.pollConnectedAccounts()
      this.pollFocusedConversation()
    }, TICK_INTERVAL_MS)
  }

  stop(): void {
    this.stopListening?.()
    this.stopListening = undefined
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = undefined
    }
  }

  setFocusedConversation(conversationId?: string): void {
    this.focusedConversationId = conversationId
    if (conversationId) {
      this.lastFocusedSyncAt = 0
    }
  }

  private pollConnectedAccounts(): void {
    if (!this.accounts) {
      return
    }

    const accounts = this.accounts.list()
    const now = Date.now()

    for (const account of accounts) {
      if (account.setupStatus !== 'connected' || !account.isEnabled) {
        continue
      }

      const interval = this.intervalsMs[account.providerId]
      if (interval === undefined) {
        continue
      }

      const last = this.lastSyncedAt.get(account.id) ?? 0

      if (now - last < interval) {
        continue
      }

      void this.runSync(account.id)
    }
  }

  private pollFocusedConversation(): void {
    if (!this.focusedConversationId || this.focusedInFlight) {
      return
    }

    if (Date.now() - this.lastFocusedSyncAt < FOCUSED_INTERVAL_MS) {
      return
    }

    void this.runFocusedSync()
  }

  private async runFocusedSync(): Promise<void> {
    if (!this.syncService || !this.focusedConversationId) {
      return
    }

    const conversationId = this.focusedConversationId
    this.focusedInFlight = true
    this.lastFocusedSyncAt = Date.now()

    try {
      const summary = await this.syncService.syncFocusedConversation(conversationId)
      if (summary) {
        eventBus.emit('sync:completed', {
          accountId: conversationId,
          conversations: 0,
          messages: summary.messages,
        })
      }
    } catch (error) {
      logger.error('Focused sync failed', { conversationId, error })
    } finally {
      this.focusedInFlight = false
    }
  }

  private async runSync(accountId: string): Promise<void> {
    if (!this.syncService) {
      return
    }

    if (this.inFlight.has(accountId)) {
      return
    }

    this.inFlight.add(accountId)
    this.lastSyncedAt.set(accountId, Date.now())

    try {
      const summary = await this.syncService.syncAccount(accountId)
      logger.info('Sync completed', { accountId, ...summary })
      eventBus.emit('sync:completed', { accountId, ...summary })
    } catch (error) {
      logger.error('Sync failed', { accountId, error })
      if (
        error instanceof AppError
        && (error.code === 'AUTH_REQUIRED' || error.code === 'TOKEN_EXPIRED')
      ) {
        eventBus.emit('sync:completed', { accountId, conversations: 0, messages: 0 })
      }
    } finally {
      this.inFlight.delete(accountId)
    }
  }
}

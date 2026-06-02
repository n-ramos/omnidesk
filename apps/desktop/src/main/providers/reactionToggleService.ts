import type { Database } from 'better-sqlite3'
import { AppError } from '@shared/errors'
import type { MessageReactionSummary, ToggleReactionRequest } from '@shared/models'
import { AccountRepository } from '@main/database/repositories/accountRepository'
import { MessageRepository } from '@main/database/repositories/messageRepository'
import { tokenVault } from '@main/security/tokenVault'
import { providerRegistry } from './providerRegistry'

const resolveSelfExternalUserId = (settings: Record<string, unknown>): string | undefined => {
  const value = settings.installerUserId
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export class ReactionToggleService {
  private readonly accounts: AccountRepository
  private readonly messages: MessageRepository

  constructor(db: Database) {
    this.accounts = new AccountRepository(db)
    this.messages = new MessageRepository(db)
  }

  async toggle(request: ToggleReactionRequest): Promise<MessageReactionSummary[]> {
    const name = request.name.trim().replace(/^:|:$/g, '')
    if (!name) {
      throw new AppError('VALIDATION_FAILED', "Le nom de la reaction est invalide.")
    }

    const context = this.messages.findReactionContext(request.messageId)
    if (!context) {
      throw new AppError('DATABASE_ERROR', 'Ce message est introuvable pour reagir.')
    }

    const account = this.accounts.get(context.accountId)
    if (!account) {
      throw new AppError('DATABASE_ERROR', 'Le compte associe est introuvable.')
    }

    const provider = providerRegistry.get(account.providerId)
    if (!provider?.toggleReaction) {
      throw new AppError('PROVIDER_UNAVAILABLE', "Ce service ne supporte pas les reactions.")
    }

    const accessToken = await tokenVault.getToken(account.providerId, account.id, 'access')
    if (!accessToken) {
      throw new AppError('AUTH_REQUIRED', "Reconnectez ce compte avant de reagir.")
    }

    const refreshToken = await tokenVault.getToken(account.providerId, account.id, 'refresh')
    const selfExternalUserId = resolveSelfExternalUserId(account.settings)

    if (!selfExternalUserId) {
      throw new AppError(
        'AUTH_REQUIRED',
        "Impossible d'identifier l'utilisateur connecte pour reagir.",
      )
    }

    await provider.toggleReaction(
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
        externalConversationId: context.externalConversationId,
        externalMessageId: context.externalMessageId,
        name,
        enabled: request.enabled,
      },
    )

    if (request.enabled) {
      this.messages.addReaction(request.messageId, name, selfExternalUserId, true)
    } else {
      this.messages.removeReaction(request.messageId, name, selfExternalUserId)
    }

    return this.messages.getReactionsForMessage(request.messageId)
  }
}

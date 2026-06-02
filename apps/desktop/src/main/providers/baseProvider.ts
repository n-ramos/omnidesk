import { AppError } from '@shared/errors'
import type {
  CommunicationProvider,
  ProviderConversationRecord,
  ProviderMessageRecord,
  ProviderRuntimeContext,
  ProviderSyncResult,
  SendMessageInput,
} from './provider.types'

export abstract class PlaceholderProvider implements CommunicationProvider {
  abstract readonly descriptor: CommunicationProvider['descriptor']

  syncConversations(
    _context: ProviderRuntimeContext,
  ): Promise<ProviderSyncResult<ProviderConversationRecord>> {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      `La synchronisation ${this.descriptor.displayName} n'est pas encore disponible.`,
    )
  }

  syncMessages(_context: ProviderRuntimeContext): Promise<ProviderSyncResult<ProviderMessageRecord>> {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      `La recuperation des messages ${this.descriptor.displayName} n'est pas encore disponible.`,
    )
  }

  sendMessage(
    _context: ProviderRuntimeContext,
    _input: SendMessageInput,
  ): Promise<{ externalMessageId: string }> {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      `L'envoi avec ${this.descriptor.displayName} n'est pas encore disponible.`,
    )
  }
}

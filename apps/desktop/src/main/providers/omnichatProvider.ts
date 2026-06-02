import type { ProviderDescriptor } from '@shared/models'
import { PlaceholderProvider } from './baseProvider'
import type {
  ProviderConversationRecord,
  ProviderMessageRecord,
  ProviderRuntimeContext,
  ProviderSyncResult,
} from './provider.types'

// Provider "natif" Omnidesk pour la messagerie omnichat (DM + groupes).
//
// Contrairement a IMAP/webpage, omnichat n'est PAS synchronise par polling : les
// messages arrivent en PUSH via le WebSocket (signalingClient) et sont persistes
// directement par omnichatMessageService. Ce provider existe uniquement pour
// ancrer une ligne `providers` (et donc un compte "self") afin que les
// conversations/messages natifs satisfassent les contraintes de cle etrangere.
//
// Le moteur de sync ne le declenche jamais : aucun intervalle 'omnichat' n'est
// configure (syncEngine.intervalsMs) et le compte self n'a pas de jeton (donc
// providerSyncService.buildContext renvoie undefined). Les sync* ci-dessous sont
// neanmoins des no-op (et non des throw) par precaution.
export class OmnichatProvider extends PlaceholderProvider {
  readonly descriptor: ProviderDescriptor = {
    id: 'omnichat',
    name: 'omnichat',
    displayName: 'Omnichat',
    capabilities: ['sync-conversations', 'sync-messages', 'send-message', 'notifications'],
    authReady: true,
  }

  override async syncConversations(
    _context: ProviderRuntimeContext,
  ): Promise<ProviderSyncResult<ProviderConversationRecord>> {
    return { items: [], cursors: [] }
  }

  override async syncMessages(
    _context: ProviderRuntimeContext,
  ): Promise<ProviderSyncResult<ProviderMessageRecord>> {
    return { items: [], cursors: [] }
  }
}

import type { ProviderDescriptor, ProviderKind } from '@shared/models'
import type { CommunicationProvider } from './provider.types'
import { ImapProvider } from './imapProvider'
import { OmnichatProvider } from './omnichatProvider'
import { WebpageProvider } from './webpageProvider'

// Slack et Teams ne sont plus des providers OAuth : ils passent en mode web (webview
// persistante) via les raccourcis WEB_SERVICE_PRESETS (cf. shared/webServices.ts), qui
// creent des comptes de type "webpage". Plus aucun secret ni jeton cote app pour eux.
export class ProviderRegistry {
  private readonly providers = new Map<ProviderKind, CommunicationProvider>([
    ['imap', new ImapProvider()],
    ['webpage', new WebpageProvider()],
    ['omnichat', new OmnichatProvider()],
  ])

  list(): ProviderDescriptor[] {
    return [...this.providers.values()].map((provider) => provider.descriptor)
  }

  get(providerId: ProviderKind): CommunicationProvider | undefined {
    return this.providers.get(providerId)
  }
}

export const providerRegistry = new ProviderRegistry()

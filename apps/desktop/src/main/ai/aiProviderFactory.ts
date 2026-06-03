import { AppError } from '@shared/errors'
import type { AiProvider } from '@shared/ai'
import { aiSecretVault } from '@main/security/aiSecretVault'
import { aiSettingsService } from './aiSettingsService'
import { OpenAiProvider } from './providers/openAiProvider'

// Construit le fournisseur IA courant selon les reglages. L'UI et l'agent ne dependent que du
// contrat AiProvider : ajouter un fournisseur = un nouveau case ici, rien d'autre.
export const createAiProvider = (): AiProvider => {
  const settings = aiSettingsService.get()
  switch (settings.provider) {
    case 'openai':
      return new OpenAiProvider({
        getToken: () => aiSecretVault.getToken(),
        baseUrl: settings.baseUrl,
      })
    default:
      throw new AppError('AI_PROVIDER_ERROR', `Fournisseur IA non supporte : ${settings.provider}`)
  }
}

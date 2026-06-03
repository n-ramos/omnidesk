import type { AiProviderId } from './provider'

// Reglages NON sensibles de l'assistant. Le token vit a part, chiffre (aiSecretVault) :
// il ne figure jamais ici et ne traverse jamais l'IPC en lecture.
export interface AiSettings {
  enabled: boolean
  provider: AiProviderId
  model: string
  // Modele de transcription (STT) pour "parler a Elodie".
  sttModel: string
  // Surcharge optionnelle de l'URL de base (defaut : API officielle du fournisseur).
  baseUrl?: string
  temperature?: number
}

export type AiSettingsPatch = Partial<AiSettings>

export const DEFAULT_AI_MODEL = 'gpt-4o-mini'
export const DEFAULT_STT_MODEL = 'whisper-1'

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  provider: 'openai',
  model: DEFAULT_AI_MODEL,
  sttModel: DEFAULT_STT_MODEL,
  temperature: 0.7,
}

// Etat expose au renderer : les reglages + un simple booleen de presence de cle.
export interface AiStatus {
  settings: AiSettings
  hasToken: boolean
}

export interface AiTokenState {
  hasToken: boolean
}

import type { AiMessage, AiToolCall } from './messages'

// Identifiant de fournisseur. Extensible : ajouter 'anthropic' implique seulement un nouvel
// adapter qui implemente AiProvider, sans toucher l'agent ni l'UI.
export type AiProviderId = 'openai' | 'anthropic'

export interface AiCapabilities {
  chat: boolean
  streaming: boolean
  toolCalling: boolean
  // Transcription audio -> texte (STT). Un fournisseur sans STT laisse ceci a false.
  stt: boolean
}

// Un outil expose au fournisseur (format generique, JSON Schema genere depuis Zod).
export interface AiProviderTool {
  name: string
  description: string
  jsonSchema: Record<string, unknown>
}

export interface AiCompletionRequest {
  model: string
  messages: AiMessage[]
  tools?: AiProviderTool[]
  temperature?: number
  signal?: AbortSignal
}

export type AiFinishReason = 'stop' | 'tool-calls' | 'length' | 'error'

// Evenements emis au fil de l'eau pendant le streaming d'une completion.
export type AiStreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'tool-call'; toolCall: AiToolCall }
  | { type: 'usage'; promptTokens: number; completionTokens: number }
  | { type: 'finish'; reason: AiFinishReason }

export interface AiConnectionTestResult {
  ok: true
}

// STT : audio capte cote renderer (Uint8Array, traverse l'IPC) -> texte. La transcription
// est faite cote main par le fournisseur (meme cle, meme acheminement que le chat).
export interface AiTranscriptionRequest {
  audio: Uint8Array
  mimeType: string
  fileName?: string
  model: string
  // Indice de langue (ex: 'fr') ; ameliore la precision quand la langue est connue.
  language?: string
}

export interface AiTranscription {
  text: string
}

// Contrat unique auquel l'UI et l'agent parlent : ils ne connaissent jamais OpenAI.
export interface AiProvider {
  readonly id: AiProviderId
  readonly capabilities: AiCapabilities
  // Verifie la cle et la joignabilite du fournisseur (bouton "Tester la connexion").
  testConnection(): Promise<AiConnectionTestResult>
  // Complete en streaming ; emet des AiStreamEvent au fur et a mesure.
  streamCompletion(request: AiCompletionRequest): AsyncIterable<AiStreamEvent>
  // Transcription audio -> texte. Present uniquement si capabilities.stt est vrai.
  transcribe?(request: AiTranscriptionRequest): Promise<AiTranscription>
}

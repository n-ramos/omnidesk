import type { AiFinishReason } from './provider'
import type { AiToolPreview } from './tools'

// Evenements pousses main -> renderer pendant une conversation IA (cf. PRELOAD_EVENTS.AI_*).
// Le streaming passe par la, jamais par la valeur de retour de l'invoke.
export interface AiChunkEvent {
  conversationId: string
  // Fragment de texte a concatener a la reponse en cours.
  delta: string
}

export interface AiDoneEvent {
  conversationId: string
  finishReason: AiFinishReason
}

export interface AiErrorEvent {
  conversationId: string
  // Code AppError (ex: AI_AUTH_FAILED) pour un eventuel traitement cote UI.
  code: string
  message: string
}

// Une action IA demarre (feedback "Elodie agit..." dans la bulle).
export interface AiToolStartEvent {
  conversationId: string
  name: string
  title: string
}

export interface AiToolEndEvent {
  conversationId: string
  name: string
  ok: boolean
  summary: string
}

// Demande de confirmation pour une action mutante : le renderer affiche l'apercu et repond
// via le canal AI_CONFIRM (avec le requestId).
export interface AiConfirmRequestEvent {
  conversationId: string
  requestId: string
  preview: AiToolPreview
}

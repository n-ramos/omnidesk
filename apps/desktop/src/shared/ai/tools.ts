import type { ZodType } from 'zod'

// Apercu (dry-run) presente a l'utilisateur AVANT une action mutante.
export interface AiToolPreview {
  title: string
  summary: string
  details?: Array<{ label: string; value: string }>
  // Phrase en clair decrivant ce qui va etre modifie si l'utilisateur valide.
  effect: string
}

export interface AiConfirmationDecision {
  approved: boolean
  // Arguments eventuellement edites par l'utilisateur avant validation.
  editedArguments?: Record<string, unknown>
}

export interface AiToolResult {
  ok: boolean
  // Texte concis renvoye au modele (jamais de secret, jamais de donnee volumineuse).
  summary: string
  data?: Record<string, unknown>
}

export interface AiToolContext {
  // Ouvre l'apercu cote renderer et attend la decision. Pertinent pour les actions mutantes.
  requestConfirmation: (preview: AiToolPreview) => Promise<AiConfirmationDecision>
  // Annulation (bulle fermee / bouton stop).
  signal: AbortSignal
  // Session de chat IA courante.
  conversationId: string
}

export type AiToolCategory = 'mail' | 'system' | 'misc'

// Une action IA = un greffon. L'ajout d'une action ne touche que ce contrat : un fichier
// actions/*.ts qui exporte une AiToolDefinition, puis son enregistrement dans le registre.
export interface AiToolDefinition<TArgs = unknown> {
  name: string
  description: string
  // Source de verite : valide les arguments ET sert a generer le JSON Schema pour le modele.
  parameters: ZodType<TArgs>
  // true => l'action modifie quelque chose : preview() + confirmation utilisateur obligatoires.
  mutating: boolean
  category: AiToolCategory
  // Requis si mutating. N'effectue AUCUNE modification : decrit seulement l'effet a venir.
  preview?: (args: TArgs, ctx: AiToolContext) => Promise<AiToolPreview>
  execute: (args: TArgs, ctx: AiToolContext) => Promise<AiToolResult>
}

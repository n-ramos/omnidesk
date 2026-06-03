// Contrat de messages provider-agnostic. Forme PGCD entre OpenAI Chat Completions
// (role/content/tool_calls + messages role:'tool' avec tool_call_id) et Anthropic Messages
// (blocs text/tool_use/tool_result). Le mapping vers un fournisseur precis vit dans son
// adapter (cf. providers/*), jamais dans l'UI ni dans l'agent.

export type AiRole = 'system' | 'user' | 'assistant' | 'tool'

// Appel d'outil demande par le modele, sous forme normalisee.
export interface AiToolCall {
  // Identifiant de correlation (OpenAI: tool_call.id ; Anthropic: tool_use.id).
  id: string
  // Nom de l'action ciblee (cf. AiActionRegistry).
  name: string
  // Arguments deja parses depuis le JSON produit par le modele.
  arguments: Record<string, unknown>
}

export interface AiTextMessage {
  role: 'system' | 'user'
  content: string
}

export interface AiAssistantMessage {
  role: 'assistant'
  // Peut etre vide si le tour est purement un appel d'outil.
  content: string
  toolCalls?: AiToolCall[]
}

export interface AiToolResultMessage {
  role: 'tool'
  // Correle a AiToolCall.id.
  toolCallId: string
  name: string
  // Resultat serialise, lu par le modele au tour suivant.
  content: string
}

export type AiMessage = AiTextMessage | AiAssistantMessage | AiToolResultMessage

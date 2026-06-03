import { AppError } from '@shared/errors'
import type {
  AiCapabilities,
  AiCompletionRequest,
  AiConnectionTestResult,
  AiFinishReason,
  AiMessage,
  AiProvider,
  AiProviderTool,
  AiStreamEvent,
  AiTranscription,
  AiTranscriptionRequest,
} from '@shared/ai'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

export interface OpenAiProviderConfig {
  // Lu a la demande : le token n'est jamais conserve par le provider, et jamais journalise.
  getToken: () => string | null
  baseUrl?: string
}

interface OpenAiToolCallDelta {
  index?: number
  id?: string
  function?: { name?: string; arguments?: string }
}

interface OpenAiStreamChoice {
  delta?: { content?: string; tool_calls?: OpenAiToolCallDelta[] }
  finish_reason?: string | null
}

interface OpenAiStreamChunk {
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  choices?: OpenAiStreamChoice[]
}

// Adapter OpenAI Chat Completions. Appels DIRECTS depuis le main (fetch global, hors CSP).
export class OpenAiProvider implements AiProvider {
  readonly id = 'openai' as const
  readonly capabilities: AiCapabilities = {
    chat: true,
    streaming: true,
    toolCalling: true,
    stt: true,
  }

  private readonly baseUrl: string

  constructor(private readonly config: OpenAiProviderConfig) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  }

  async testConnection(): Promise<AiConnectionTestResult> {
    const token = this.requireToken()
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {
      throw new AppError('AI_NETWORK', 'Connexion a OpenAI impossible. Verifiez votre reseau.')
    }
    if (!response.ok) {
      throw await this.toApiError(response)
    }
    return { ok: true }
  }

  // Transcription audio -> texte via /v1/audio/transcriptions (multipart). L'audio vient du
  // renderer (capture micro) et n'est jamais journalise.
  async transcribe(request: AiTranscriptionRequest): Promise<AiTranscription> {
    const token = this.requireToken()
    const form = new FormData()
    // Copie en ArrayBuffer dedie pour satisfaire le type BlobPart (evite aussi tout buffer partage).
    const audioBuffer = request.audio.buffer.slice(
      request.audio.byteOffset,
      request.audio.byteOffset + request.audio.byteLength,
    ) as ArrayBuffer
    form.append(
      'file',
      new Blob([audioBuffer], { type: request.mimeType }),
      request.fileName ?? 'audio.webm',
    )
    form.append('model', request.model)
    if (request.language) {
      form.append('language', request.language)
    }
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
    } catch {
      throw new AppError('AI_NETWORK', 'Connexion a OpenAI impossible. Verifiez votre reseau.')
    }
    if (!response.ok) {
      throw await this.toApiError(response)
    }
    const data = (await response.json()) as { text?: string }
    return { text: data.text ?? '' }
  }

  async *streamCompletion(request: AiCompletionRequest): AsyncIterable<AiStreamEvent> {
    const token = this.requireToken()
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages.map(toOpenAiMessage),
          tools: request.tools?.length ? request.tools.map(toOpenAiTool) : undefined,
          temperature: request.temperature,
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal: request.signal,
      })
    } catch (error) {
      // Annulation utilisateur (AbortController) : sortie silencieuse, pas une erreur.
      if (isAbortError(error)) {
        return
      }
      throw new AppError('AI_NETWORK', 'Connexion a OpenAI impossible. Verifiez votre reseau.')
    }

    if (!response.ok || !response.body) {
      throw await this.toApiError(response)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    // Les tool_calls arrivent fragmentes par index : on accumule jusqu'au finish_reason.
    const toolAccumulators = new Map<number, { id?: string; name?: string; args: string }>()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let newlineIndex = buffer.indexOf('\n')
        while (newlineIndex !== -1) {
          const rawLine = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)
          newlineIndex = buffer.indexOf('\n')

          if (!rawLine.startsWith('data:')) continue
          const data = rawLine.slice('data:'.length).trim()
          if (data === '[DONE]') continue

          let chunk: OpenAiStreamChunk
          try {
            chunk = JSON.parse(data) as OpenAiStreamChunk
          } catch {
            continue
          }

          if (chunk.usage) {
            yield {
              type: 'usage',
              promptTokens: chunk.usage.prompt_tokens ?? 0,
              completionTokens: chunk.usage.completion_tokens ?? 0,
            }
          }

          const choice = chunk.choices?.[0]
          if (!choice) continue

          const delta = choice.delta
          if (typeof delta?.content === 'string' && delta.content.length > 0) {
            yield { type: 'text-delta', delta: delta.content }
          }

          if (Array.isArray(delta?.tool_calls)) {
            for (const toolDelta of delta.tool_calls) {
              const index = toolDelta.index ?? 0
              const acc = toolAccumulators.get(index) ?? { args: '' }
              if (toolDelta.id) acc.id = toolDelta.id
              if (toolDelta.function?.name) acc.name = toolDelta.function.name
              if (toolDelta.function?.arguments) acc.args += toolDelta.function.arguments
              toolAccumulators.set(index, acc)
            }
          }

          if (choice.finish_reason) {
            for (const [index, acc] of toolAccumulators) {
              if (!acc.name) continue
              let parsedArgs: Record<string, unknown> = {}
              if (acc.args) {
                try {
                  parsedArgs = JSON.parse(acc.args) as Record<string, unknown>
                } catch {
                  parsedArgs = {}
                }
              }
              yield {
                type: 'tool-call',
                toolCall: {
                  // Repli unique par index si OpenAI omettait l'id (tres rare en streaming).
                  id: acc.id ?? `call_${acc.name}_${index}`,
                  name: acc.name,
                  arguments: parsedArgs,
                },
              }
            }
            toolAccumulators.clear()
            yield { type: 'finish', reason: toFinishReason(choice.finish_reason) }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  private requireToken(): string {
    const token = this.config.getToken()
    if (!token) {
      throw new AppError('AI_NOT_CONFIGURED', "Aucune cle d'API n'est configuree.")
    }
    return token
  }

  // Mappe une reponse HTTP d'erreur en AppError (sans jamais journaliser la cle ni le corps brut).
  private async toApiError(response: Response): Promise<AppError> {
    let detail = ''
    try {
      const body = (await response.json()) as { error?: { message?: string } }
      detail = typeof body.error?.message === 'string' ? body.error.message : ''
    } catch {
      // corps non-JSON : on s'en tient au statut
    }
    if (response.status === 401 || response.status === 403) {
      return new AppError('AI_AUTH_FAILED', detail || "Cle d'API refusee par OpenAI.")
    }
    if (response.status === 429) {
      return new AppError('AI_RATE_LIMITED', detail || 'Quota OpenAI atteint. Reessayez plus tard.')
    }
    return new AppError('AI_PROVIDER_ERROR', detail || `Erreur OpenAI (statut ${response.status}).`)
  }
}

const toOpenAiMessage = (message: AiMessage): Record<string, unknown> => {
  switch (message.role) {
    case 'system':
    case 'user':
      return { role: message.role, content: message.content }
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content.length > 0 ? message.content : null,
        tool_calls: message.toolCalls?.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        })),
      }
    case 'tool':
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content }
  }
}

const toOpenAiTool = (tool: AiProviderTool): Record<string, unknown> => ({
  type: 'function',
  function: { name: tool.name, description: tool.description, parameters: tool.jsonSchema },
})

const toFinishReason = (reason: string): AiFinishReason => {
  switch (reason) {
    case 'tool_calls':
      return 'tool-calls'
    case 'length':
      return 'length'
    default:
      return 'stop'
  }
}

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError'

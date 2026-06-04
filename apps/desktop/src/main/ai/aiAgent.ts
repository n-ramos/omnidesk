import { randomUUID } from 'node:crypto'
import { AppError, toSafeError } from '@shared/errors'
import type {
  AiCompletionRequest,
  AiConfirmationDecision,
  AiFinishReason,
  AiMessage,
  AiProvider,
  AiProviderTool,
  AiToolCall,
  AiToolDefinition,
  AiToolPreview,
  AiToolResult,
} from '@shared/ai'
import { eventBus } from '@main/events/eventBus'
import { logger } from '@main/logger'
import { aiSecretVault } from '@main/security/aiSecretVault'
import { aiActionRegistry } from './aiActionRegistry'
import { aiSettingsService } from './aiSettingsService'
import { createAiProvider } from './aiProviderFactory'

// Persona d'Elodie + cadre d'usage des outils. Reste concis : envoye a chaque tour.
const SYSTEM_PROMPT = [
  "Tu es Elodie, l'assistante integree a Omnidesk (mails, messagerie, navigateur). Reponds en",
  'francais, de maniere concise et bienveillante. Tu disposes d\'outils pour consulter et gerer',
  'les mails de l\'utilisateur. Pour agir sur un mail precis, appelle d\'abord mail.list_messages',
  'afin d\'obtenir son conversationId. Toute action qui modifie quelque chose (envoyer un mail,',
  'marquer lu, deplacer, supprimer) demande une confirmation a l\'utilisateur : annonce ton',
  'intention puis laisse la confirmation se faire. Si une action est refusee, propose une',
  'alternative sans insister. Tu peux aussi gerer les pense-betes (rappels), les taches (todo),',
  "les notes, la meteo, les flux RSS et les widgets de l'accueil personnalise. Avant d'agir sur",
  "un widget, appelle home.list_widgets pour verifier qu'il est present ; sinon propose de",
  "l'ajouter avec home.add_widget.",
].join(' ')

const MAX_TOOL_ROUNDTRIPS = 6
const CONFIRMATION_TIMEOUT_MS = 2 * 60 * 1000
// Plafond du nombre de conversations gardees en memoire (borne la croissance sur longue session).
const MAX_CONVERSATIONS = 30

const TOOL_TITLES: Record<string, string> = {
  'mail.compose': "Redaction d'un mail",
  'mail.list_messages': 'Lecture de vos mails',
  'mail.list_folders': 'Lecture des dossiers',
  'mail.mark_read': "Mise a jour d'un mail",
  'mail.move': "Deplacement d'un mail",
  'mail.delete': "Suppression d'un mail",
}

interface AiConversation {
  messages: AiMessage[]
  controller?: AbortController
}

interface PendingConfirmation {
  resolve: (decision: AiConfirmationDecision) => void
  timer: ReturnType<typeof setTimeout>
}

interface CompletionResult {
  text: string
  toolCalls: AiToolCall[]
  finishReason: AiFinishReason
}

// Orchestre une conversation IA : streaming texte + boucle d'outils avec confirmation des
// actions mutantes. Ne rejette jamais cote send() (toute erreur devient un ai:error).
class AiAgentService {
  private readonly conversations = new Map<string, AiConversation>()
  private readonly pendingConfirmations = new Map<string, PendingConfirmation>()

  async send(conversationId: string, userMessage: string): Promise<void> {
    let conversation = this.conversations.get(conversationId)
    if (!conversation) {
      // Nouvelle conversation : on oublie la plus ancienne si on atteint le plafond.
      if (this.conversations.size >= MAX_CONVERSATIONS) {
        const oldest = this.conversations.keys().next().value
        if (oldest !== undefined) this.conversations.delete(oldest)
      }
      conversation = { messages: [systemMessage()] }
    }
    this.conversations.set(conversationId, conversation)
    conversation.messages.push({ role: 'user', content: userMessage })

    const controller = new AbortController()
    conversation.controller = controller

    try {
      const settings = aiSettingsService.get()
      if (!settings.enabled || !aiSecretVault.hasToken()) {
        throw new AppError(
          'AI_NOT_CONFIGURED',
          "L'assistant n'est pas configure. Activez-le et ajoutez une cle dans les reglages.",
        )
      }
      const provider = createAiProvider()
      const tools = aiActionRegistry.toProviderTools()

      for (let round = 1; round <= MAX_TOOL_ROUNDTRIPS; round += 1) {
        const result = await this.runCompletion(conversationId, provider, conversation.messages, tools, {
          model: settings.model,
          temperature: settings.temperature,
          signal: controller.signal,
        })

        if (controller.signal.aborted) {
          this.finalizeAbort(conversationId, conversation, result.text)
          return
        }

        if (result.finishReason !== 'tool-calls' || result.toolCalls.length === 0) {
          conversation.messages.push({ role: 'assistant', content: result.text })
          conversation.controller = undefined
          eventBus.emit('ai:done', { conversationId, finishReason: result.finishReason })
          return
        }

        // Tour d'outils : on enregistre l'intention puis on execute chaque appel.
        conversation.messages.push({
          role: 'assistant',
          content: result.text,
          toolCalls: result.toolCalls,
        })
        for (const toolCall of result.toolCalls) {
          const toolResult = await this.executeTool(conversationId, toolCall, controller.signal)
          conversation.messages.push({
            role: 'tool',
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: JSON.stringify(toolResult),
          })
          if (controller.signal.aborted) {
            this.finalizeAbort(conversationId, conversation, '')
            return
          }
        }
      }

      conversation.controller = undefined
      throw new AppError('AI_PROVIDER_ERROR', "Trop d'etapes enchainees ; conversation interrompue.")
    } catch (error) {
      conversation.controller = undefined
      if (controller.signal.aborted) {
        eventBus.emit('ai:done', { conversationId, finishReason: 'stop' })
        return
      }
      this.emitError(conversationId, error)
    }
  }

  cancel(conversationId: string): void {
    this.conversations.get(conversationId)?.controller?.abort()
  }

  // Resout une demande de confirmation (appele par le handler IPC AI_CONFIRM).
  resolveConfirmation(requestId: string, decision: AiConfirmationDecision): void {
    this.pendingConfirmations.get(requestId)?.resolve(decision)
  }

  private async runCompletion(
    conversationId: string,
    provider: AiProvider,
    messages: AiMessage[],
    tools: AiProviderTool[],
    options: Pick<AiCompletionRequest, 'model' | 'temperature' | 'signal'>,
  ): Promise<CompletionResult> {
    let text = ''
    const toolCalls: AiToolCall[] = []
    let finishReason: AiFinishReason = 'stop'

    const stream = provider.streamCompletion({
      model: options.model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      temperature: options.temperature,
      signal: options.signal,
    })

    for await (const event of stream) {
      if (options.signal?.aborted) break
      if (event.type === 'text-delta') {
        text += event.delta
        eventBus.emit('ai:chunk', { conversationId, delta: event.delta })
      } else if (event.type === 'tool-call') {
        toolCalls.push(event.toolCall)
      } else if (event.type === 'finish') {
        finishReason = event.reason
      }
    }

    return { text, toolCalls, finishReason }
  }

  private async executeTool(
    conversationId: string,
    toolCall: AiToolCall,
    signal: AbortSignal,
  ): Promise<AiToolResult> {
    let definition: AiToolDefinition<unknown>
    let args: unknown
    try {
      const parsed = aiActionRegistry.parseArguments(toolCall.name, toolCall.arguments)
      definition = parsed.definition
      args = parsed.args
    } catch (error) {
      // Outil inconnu ou arguments invalides : on renvoie l'echec au modele, sans rien executer.
      return { ok: false, summary: toSafeError(error).message }
    }

    eventBus.emit('ai:tool-start', {
      conversationId,
      name: definition.name,
      title: TOOL_TITLES[definition.name] ?? definition.name,
    })

    let result: AiToolResult
    try {
      const ctx = {
        requestConfirmation: (preview: AiToolPreview): Promise<AiConfirmationDecision> =>
          this.requestConfirmation(conversationId, preview, signal),
        signal,
        conversationId,
      }
      if (definition.mutating) {
        if (!definition.preview) {
          result = { ok: false, summary: 'Action mal configuree (apercu manquant).' }
        } else {
          const preview = await definition.preview(args, ctx)
          const decision = await ctx.requestConfirmation(preview)
          result = decision.approved
            ? await definition.execute(decision.editedArguments ?? args, ctx)
            : { ok: false, summary: "Action refusee par l'utilisateur." }
        }
      } else {
        result = await definition.execute(args, ctx)
      }
    } catch (error) {
      result = { ok: false, summary: toSafeError(error).message }
    }

    eventBus.emit('ai:tool-end', {
      conversationId,
      name: definition.name,
      ok: result.ok,
      summary: result.summary,
    })
    return result
  }

  // Cree une demande de confirmation, l'emet au renderer et attend la decision (ou un
  // timeout / une annulation, qui valent un refus).
  private requestConfirmation(
    conversationId: string,
    preview: AiToolPreview,
    signal: AbortSignal,
  ): Promise<AiConfirmationDecision> {
    if (signal.aborted) {
      return Promise.resolve({ approved: false })
    }
    return new Promise<AiConfirmationDecision>((resolve) => {
      const requestId = randomUUID()
      const settle = (decision: AiConfirmationDecision): void => {
        const pending = this.pendingConfirmations.get(requestId)
        if (!pending) return
        clearTimeout(pending.timer)
        this.pendingConfirmations.delete(requestId)
        signal.removeEventListener('abort', onAbort)
        resolve(decision)
      }
      const onAbort = (): void => settle({ approved: false })
      const timer = setTimeout(() => settle({ approved: false }), CONFIRMATION_TIMEOUT_MS)
      this.pendingConfirmations.set(requestId, { resolve: settle, timer })
      signal.addEventListener('abort', onAbort, { once: true })
      eventBus.emit('ai:confirm-request', { conversationId, requestId, preview })
    })
  }

  private finalizeAbort(conversationId: string, conversation: AiConversation, text: string): void {
    if (text.length > 0) {
      conversation.messages.push({ role: 'assistant', content: text })
    }
    conversation.controller = undefined
    eventBus.emit('ai:done', { conversationId, finishReason: 'stop' })
  }

  private emitError(conversationId: string, error: unknown): void {
    const safe = toSafeError(error)
    logger.warn('ai agent error', { code: safe.code, message: safe.message })
    eventBus.emit('ai:error', { conversationId, code: safe.code, message: safe.message })
  }
}

const systemMessage = (): AiMessage => ({ role: 'system', content: SYSTEM_PROMPT })

export const aiAgentService = new AiAgentService()

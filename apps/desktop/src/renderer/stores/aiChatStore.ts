import { defineStore } from 'pinia'
import type {
  AiChunkEvent,
  AiConfirmRequestEvent,
  AiDoneEvent,
  AiErrorEvent,
  AiToolEndEvent,
  AiToolStartEvent,
} from '@shared/ai'

export interface AiChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface AiChatState {
  open: boolean
  conversationId: string
  messages: AiChatMessage[]
  streaming: boolean
  error: string | null
  streamingMessageId: string | null
  // Action en cours cote Elodie (ex: "Lecture de vos mails"), pour le feedback dans la bulle.
  activity: string | null
  // Demande de confirmation d'action mutante en attente (affichee par AiConfirmDialog).
  pendingConfirmation: AiConfirmRequestEvent | null
  subscribed: boolean
}

// Disposers des abonnements aux evenements de streaming (module-level, comme omnichatStore).
let stopChunk: (() => void) | undefined
let stopDone: (() => void) | undefined
let stopError: (() => void) | undefined
let stopToolStart: (() => void) | undefined
let stopToolEnd: (() => void) | undefined
let stopConfirm: (() => void) | undefined

let counter = 0
const nextId = (): string => {
  counter += 1
  return `aimsg-${counter}`
}

const newConversationId = (): string => {
  try {
    return crypto.randomUUID()
  } catch {
    counter += 1
    return `conv-${counter}`
  }
}

export const useAiChatStore = defineStore('aiChat', {
  state: (): AiChatState => ({
    open: false,
    conversationId: '',
    messages: [],
    streaming: false,
    error: null,
    streamingMessageId: null,
    activity: null,
    pendingConfirmation: null,
    subscribed: false,
  }),

  actions: {
    // Abonne le store aux evenements main -> renderer une seule fois.
    ensureSubscribed(): void {
      if (this.subscribed) return
      const api = window.omnidesk
      if (!api?.events?.onAiChunk) return
      stopChunk?.()
      stopDone?.()
      stopError?.()
      stopToolStart?.()
      stopToolEnd?.()
      stopConfirm?.()
      stopChunk = api.events.onAiChunk((event) => this.onChunk(event))
      stopDone = api.events.onAiDone((event) => this.onDone(event))
      stopError = api.events.onAiError((event) => this.onError(event))
      stopToolStart = api.events.onAiToolStart((event) => this.onToolStart(event))
      stopToolEnd = api.events.onAiToolEnd((event) => this.onToolEnd(event))
      stopConfirm = api.events.onAiConfirmRequest((event) => this.onConfirmRequest(event))
      this.subscribed = true
    },

    openPanel(): void {
      if (!this.conversationId) this.conversationId = newConversationId()
      this.ensureSubscribed()
      this.open = true
    },

    closePanel(): void {
      this.open = false
    },

    toggle(): void {
      if (this.open) this.closePanel()
      else this.openPanel()
    },

    // Demarre une nouvelle conversation (vide l'historique cote renderer).
    newChat(): void {
      if (this.streaming) this.cancel()
      this.messages = []
      this.error = null
      this.streaming = false
      this.streamingMessageId = null
      this.activity = null
      this.pendingConfirmation = null
      this.conversationId = newConversationId()
    },

    async send(text: string): Promise<void> {
      const content = text.trim()
      if (!content || this.streaming) return
      const api = window.omnidesk
      if (!api?.ai?.chat) return
      if (!this.conversationId) this.conversationId = newConversationId()
      this.ensureSubscribed()

      this.error = null
      this.messages.push({ id: nextId(), role: 'user', content })
      const assistantId = nextId()
      this.messages.push({ id: assistantId, role: 'assistant', content: '' })
      this.streamingMessageId = assistantId
      this.streaming = true

      try {
        await api.ai.chat.send(this.conversationId, content)
      } catch (error) {
        this.streaming = false
        this.streamingMessageId = null
        this.error = error instanceof Error ? error.message : 'Erreur inattendue.'
        this.dropEmptyAssistant(assistantId)
      }
    },

    cancel(): void {
      const api = window.omnidesk
      if (api?.ai?.chat && this.conversationId) {
        void api.ai.chat.cancel(this.conversationId)
      }
    },

    // Repond a la demande de confirmation en attente (depuis AiConfirmDialog).
    respondConfirmation(approved: boolean): void {
      const pending = this.pendingConfirmation
      if (!pending) return
      this.pendingConfirmation = null
      const api = window.omnidesk
      if (api?.ai?.confirm) {
        void api.ai.confirm(pending.requestId, approved)
      }
    },

    onChunk(event: AiChunkEvent): void {
      if (event.conversationId !== this.conversationId) return
      const message = this.messages.find((item) => item.id === this.streamingMessageId)
      if (message) message.content += event.delta
    },

    onDone(event: AiDoneEvent): void {
      if (event.conversationId !== this.conversationId) return
      if (this.streamingMessageId) this.dropEmptyAssistant(this.streamingMessageId)
      this.streaming = false
      this.streamingMessageId = null
      this.activity = null
      // Si on a coupe (Stop) alors qu'une confirmation etait affichee, on referme le modal.
      this.pendingConfirmation = null
    },

    onError(event: AiErrorEvent): void {
      if (event.conversationId !== this.conversationId) return
      if (this.streamingMessageId) this.dropEmptyAssistant(this.streamingMessageId)
      this.streaming = false
      this.streamingMessageId = null
      this.activity = null
      this.pendingConfirmation = null
      this.error = event.message
    },

    onToolStart(event: AiToolStartEvent): void {
      if (event.conversationId !== this.conversationId) return
      this.activity = event.title
    },

    onToolEnd(event: AiToolEndEvent): void {
      if (event.conversationId !== this.conversationId) return
      this.activity = null
    },

    onConfirmRequest(event: AiConfirmRequestEvent): void {
      if (event.conversationId !== this.conversationId) return
      this.pendingConfirmation = event
    },

    // Retire le message assistant s'il est reste vide (erreur immediate, reponse vide).
    dropEmptyAssistant(id: string): void {
      const index = this.messages.findIndex((item) => item.id === id)
      if (index !== -1 && this.messages[index]?.content.length === 0) {
        this.messages.splice(index, 1)
      }
    },
  },
})

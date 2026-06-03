<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Bot, Loader2, Mic, Plus, Send, Square, X } from 'lucide-vue-next'
import { useAiChatStore } from '@renderer/stores/aiChatStore'
import { useAiStore } from '@renderer/stores/aiStore'
import { useAppStore } from '@renderer/stores/appStore'

const chat = useAiChatStore()
const ai = useAiStore()
const appStore = useAppStore()

const draft = ref('')
const scrollArea = ref<HTMLElement | null>(null)

// --- Dictee vocale (STT) -----------------------------------------------------
const recording = ref(false)
const transcribing = ref(false)
const micError = ref<string | null>(null)
let mediaRecorder: MediaRecorder | null = null
let mediaStream: MediaStream | null = null
let audioChunks: Blob[] = []

const canSend = computed(() => draft.value.trim().length > 0 && !chat.streaming)
// On ne montre l'invite de configuration qu'une fois les reglages charges (sinon faux negatif).
const showConfigHint = computed(() => ai.loaded && !ai.configured)

const scrollToBottom = (): void => {
  void nextTick(() => {
    const el = scrollArea.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

watch(
  () => [chat.open, chat.messages.length, chat.messages[chat.messages.length - 1]?.content, chat.activity],
  () => {
    if (chat.open) scrollToBottom()
  },
)

onMounted(() => {
  if (!ai.loaded) void ai.load()
})

const submit = (): void => {
  if (!canSend.value) return
  const text = draft.value
  draft.value = ''
  void chat.send(text)
}

const onKeydown = (event: KeyboardEvent): void => {
  // Entree envoie ; Maj+Entree insere un saut de ligne.
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    submit()
  }
}

const openSettings = (): void => {
  appStore.setView('settings')
  chat.closePanel()
}

const releaseStream = (): void => {
  mediaStream?.getTracks().forEach((track) => track.stop())
  mediaStream = null
}

const startRecording = async (): Promise<void> => {
  if (recording.value || transcribing.value) return
  micError.value = null
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    micError.value = "Micro indisponible ou acces refuse."
    return
  }
  audioChunks = []
  mediaRecorder = new MediaRecorder(mediaStream)
  mediaRecorder.ondataavailable = (event): void => {
    if (event.data.size > 0) audioChunks.push(event.data)
  }
  mediaRecorder.onstop = (): void => {
    void transcribeRecording()
  }
  mediaRecorder.start()
  recording.value = true
}

const stopRecording = (): void => {
  if (!recording.value) return
  recording.value = false
  mediaRecorder?.stop()
  releaseStream()
}

const transcribeRecording = async (): Promise<void> => {
  const mimeType = mediaRecorder?.mimeType || 'audio/webm'
  const blob = new Blob(audioChunks, { type: mimeType })
  audioChunks = []
  mediaRecorder = null
  if (blob.size === 0) return
  const api = window.omnidesk
  if (!api?.ai?.transcribe) return
  transcribing.value = true
  try {
    const audio = new Uint8Array(await blob.arrayBuffer())
    const result = await api.ai.transcribe(audio, blob.type)
    const text = result.text.trim()
    if (text) draft.value = draft.value ? `${draft.value} ${text}` : text
  } catch (error) {
    micError.value = error instanceof Error ? error.message : 'Transcription impossible.'
  } finally {
    transcribing.value = false
  }
}

const toggleRecording = (): void => {
  if (recording.value) stopRecording()
  else void startRecording()
}

onBeforeUnmount(() => {
  if (recording.value) mediaRecorder?.stop()
  releaseStream()
})
</script>

<template>
  <Transition name="ai-panel">
    <section
      v-if="chat.open"
      class="app-no-drag fixed bottom-[6.75rem] right-5 z-[60] flex max-h-[min(60vh,520px)] w-[360px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl bg-ink-900/95 shadow-2xl shadow-black/50 ring-1 ring-white/10 backdrop-blur-md"
    >
      <header class="flex items-center gap-2 border-b border-white/10 px-3.5 py-2.5">
        <Bot class="text-accent-mint" :size="18" />
        <span class="flex-1 text-sm font-semibold text-white">Elodie</span>
        <button
          type="button"
          class="grid size-7 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
          title="Nouvelle conversation"
          @click="chat.newChat()"
        >
          <Plus :size="16" />
        </button>
        <button
          type="button"
          class="grid size-7 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
          title="Fermer"
          @click="chat.closePanel()"
        >
          <X :size="16" />
        </button>
      </header>

      <div ref="scrollArea" class="flex-1 space-y-3 overflow-y-auto px-3.5 py-3.5">
        <div
          v-if="showConfigHint"
          class="rounded-xl bg-ink-950/55 p-3 text-sm leading-6 text-zinc-300"
        >
          <p>Pour discuter avec Elodie, activez l'assistant et ajoutez une cle OpenAI.</p>
          <button
            type="button"
            class="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent-mint/15 px-3 py-1.5 text-xs font-medium text-accent-mint ring-1 ring-accent-mint/30 transition hover:bg-accent-mint/25"
            @click="openSettings"
          >
            Ouvrir les reglages
          </button>
        </div>

        <p v-else-if="chat.messages.length === 0" class="px-1 text-sm leading-6 text-zinc-500">
          Posez une question a Elodie, par ecrit ou au micro. Elle peut aussi consulter et gerer
          vos mails (avec votre confirmation).
        </p>

        <div
          v-for="message in chat.messages"
          :key="message.id"
          class="flex"
          :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div
            class="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-6"
            :class="
              message.role === 'user'
                ? 'bg-accent-mint/15 text-zinc-100 ring-1 ring-accent-mint/25'
                : 'bg-white/[0.05] text-zinc-200 ring-1 ring-white/10'
            "
          >
            <template v-if="message.content">{{ message.content }}</template>
            <span
              v-else-if="chat.streaming && message.id === chat.streamingMessageId"
              class="inline-flex items-center gap-1 py-1"
            >
              <span class="ai-dot" />
              <span class="ai-dot" />
              <span class="ai-dot" />
            </span>
          </div>
        </div>

        <p v-if="chat.activity" class="flex items-center gap-1.5 px-1 text-xs text-zinc-500">
          <Loader2 :size="13" class="animate-spin" />
          {{ chat.activity }}...
        </p>

        <p v-if="chat.error" class="px-1 text-xs leading-5 text-accent-coral">{{ chat.error }}</p>
      </div>

      <footer class="border-t border-white/10 p-2.5">
        <p v-if="micError" class="mb-1.5 px-1 text-xs text-accent-coral">{{ micError }}</p>
        <div class="flex items-end gap-2">
          <button
            type="button"
            class="grid size-10 shrink-0 place-items-center rounded-xl ring-1 transition"
            :class="
              recording
                ? 'bg-accent-coral/20 text-accent-coral ring-accent-coral/40'
                : 'bg-white/[0.04] text-zinc-300 ring-white/10 hover:bg-white/[0.08] disabled:opacity-40'
            "
            :disabled="transcribing || chat.streaming"
            :title="recording ? 'Arreter la dictee' : 'Dicter au micro'"
            @click="toggleRecording"
          >
            <Loader2 v-if="transcribing" :size="16" class="animate-spin" />
            <Mic v-else :size="16" :class="recording ? 'animate-pulse' : ''" />
          </button>

          <textarea
            v-model="draft"
            rows="1"
            :placeholder="recording ? 'Dictee en cours...' : 'Ecrire un message...'"
            class="max-h-28 min-h-[2.5rem] flex-1 resize-none rounded-xl bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-white/10 transition focus:ring-accent-mint/40"
            @keydown="onKeydown"
          />

          <button
            v-if="chat.streaming"
            type="button"
            class="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-zinc-200 ring-1 ring-white/10 transition hover:bg-white/[0.1]"
            title="Arreter"
            @click="chat.cancel()"
          >
            <Square :size="16" />
          </button>
          <button
            v-else
            type="button"
            class="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-mint text-ink-950 shadow-lift transition hover:bg-[#a5f0ce] disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!canSend"
            title="Envoyer"
            @click="submit"
          >
            <Send :size="16" />
          </button>
        </div>
      </footer>
    </section>
  </Transition>
</template>

<style scoped>
.ai-panel-enter-active,
.ai-panel-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}
.ai-panel-enter-from,
.ai-panel-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

.ai-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: rgb(var(--accent-mint) / 0.7);
  animation: ai-bounce 1s infinite ease-in-out;
}
.ai-dot:nth-child(2) {
  animation-delay: 0.15s;
}
.ai-dot:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes ai-bounce {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-3px);
  }
}
</style>

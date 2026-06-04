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

// --- Deplacement de la bulle (drag par l'en-tete) ----------------------------
const STORAGE_POS = 'omnidesk.ai.chatPos'
const panelEl = ref<HTMLElement | null>(null)

function loadPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_POS)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { x: number; y: number }
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return parsed
  } catch {
    // ignore : position invalide -> on retombe sur l'ancrage par defaut.
  }
  return null
}

// null = ancrage CSS par defaut (en bas a droite) ; sinon position explicite (x,y).
const position = ref<{ x: number; y: number } | null>(loadPosition())
let dragOffsetX = 0
let dragOffsetY = 0
let dragW = 360
let dragH = 0

const clampPosition = (x: number, y: number): { x: number; y: number } => {
  const maxX = Math.max(0, window.innerWidth - dragW)
  const maxY = Math.max(0, window.innerHeight - dragH)
  return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) }
}

// --- Redimensionnement de la bulle (poignee bas-droite) ----------------------
const STORAGE_SIZE = 'omnidesk.ai.chatSize'
const MIN_PANEL_W = 320
const MIN_PANEL_H = 320

function loadSize(): { w: number; h: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_SIZE)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { w: number; h: number }
    if (typeof parsed?.w === 'number' && typeof parsed?.h === 'number') return parsed
  } catch {
    // ignore : taille invalide -> on retombe sur la taille par defaut.
  }
  return null
}

// null = taille par defaut (classes CSS) ; sinon largeur/hauteur explicites (px).
const size = ref<{ w: number; h: number } | null>(loadSize())
let resizeStartX = 0
let resizeStartY = 0
let resizeStartW = 0
let resizeStartH = 0

const clampSize = (w: number, h: number): { w: number; h: number } => {
  const anchorX = position.value?.x ?? 0
  const anchorY = position.value?.y ?? 0
  const maxW = Math.max(MIN_PANEL_W, window.innerWidth - anchorX - 8)
  const maxH = Math.max(MIN_PANEL_H, window.innerHeight - anchorY - 8)
  return {
    w: Math.min(Math.max(MIN_PANEL_W, w), maxW),
    h: Math.min(Math.max(MIN_PANEL_H, h), maxH),
  }
}

const panelStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}
  if (position.value) {
    style.left = `${position.value.x}px`
    style.top = `${position.value.y}px`
    style.right = 'auto'
    style.bottom = 'auto'
  }
  if (size.value) {
    style.width = `${size.value.w}px`
    style.height = `${size.value.h}px`
    style.maxWidth = 'none'
    style.maxHeight = 'none'
  }
  return style
})

const onDrag = (event: PointerEvent): void => {
  position.value = clampPosition(event.clientX - dragOffsetX, event.clientY - dragOffsetY)
}

const endDrag = (): void => {
  window.removeEventListener('pointermove', onDrag)
  if (position.value) {
    try {
      localStorage.setItem(STORAGE_POS, JSON.stringify(position.value))
    } catch {
      // stockage indisponible : la position ne sera juste pas memorisee.
    }
  }
}

const startDrag = (event: PointerEvent): void => {
  // Ne pas demarrer un drag depuis un bouton de l'en-tete (nouvelle conversation / fermer).
  if ((event.target as HTMLElement).closest('button')) return
  const el = panelEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  dragW = rect.width
  dragH = rect.height
  dragOffsetX = event.clientX - rect.left
  dragOffsetY = event.clientY - rect.top
  // On passe en positionnement explicite des le depart (evite tout saut visuel).
  position.value = clampPosition(rect.left, rect.top)
  window.addEventListener('pointermove', onDrag)
  window.addEventListener('pointerup', endDrag, { once: true })
}

const onResize = (event: PointerEvent): void => {
  size.value = clampSize(
    resizeStartW + (event.clientX - resizeStartX),
    resizeStartH + (event.clientY - resizeStartY),
  )
}

const endResize = (): void => {
  window.removeEventListener('pointermove', onResize)
  try {
    if (size.value) localStorage.setItem(STORAGE_SIZE, JSON.stringify(size.value))
    if (position.value) localStorage.setItem(STORAGE_POS, JSON.stringify(position.value))
  } catch {
    // stockage indisponible : la taille ne sera juste pas memorisee.
  }
}

const startResize = (event: PointerEvent): void => {
  const el = panelEl.value
  if (!el) return
  event.preventDefault()
  event.stopPropagation()
  const rect = el.getBoundingClientRect()
  dragW = rect.width
  dragH = rect.height
  // On epingle le coin haut-gauche pour que le redimensionnement s'etende vers le bas-droite.
  position.value = clampPosition(rect.left, rect.top)
  resizeStartX = event.clientX
  resizeStartY = event.clientY
  resizeStartW = rect.width
  resizeStartH = rect.height
  window.addEventListener('pointermove', onResize)
  window.addEventListener('pointerup', endResize, { once: true })
}

// --- Dictee vocale (STT) -----------------------------------------------------
const recording = ref(false)
const transcribing = ref(false)
const micError = ref<string | null>(null)
let mediaRecorder: MediaRecorder | null = null
let mediaStream: MediaStream | null = null
let audioChunks: Blob[] = []

// Detection de silence : on arrete tout seul apres une pause, sans recliquer sur le micro.
const SILENCE_MS = 1500
const MAX_RECORDING_MS = 30_000
const SPEECH_THRESHOLD = 0.01
let audioContext: AudioContext | null = null
let analyser: AnalyserNode | null = null
let vadInterval: ReturnType<typeof setInterval> | null = null
let maxTimer: ReturnType<typeof setTimeout> | null = null
let speechSeen = false
let silenceStart = 0

const teardownVad = (): void => {
  if (vadInterval) {
    clearInterval(vadInterval)
    vadInterval = null
  }
  if (maxTimer) {
    clearTimeout(maxTimer)
    maxTimer = null
  }
  analyser = null
  if (audioContext) {
    void audioContext.close()
    audioContext = null
  }
}

const setupVad = (stream: MediaStream): void => {
  try {
    audioContext = new AudioContext()
    void audioContext.resume()
    const source = audioContext.createMediaStreamSource(stream)
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 2048
    source.connect(analyser)
    const samples = new Float32Array(analyser.fftSize)
    speechSeen = false
    silenceStart = 0
    vadInterval = setInterval(() => {
      if (!analyser) return
      analyser.getFloatTimeDomainData(samples)
      let sum = 0
      for (const value of samples) sum += value * value
      const rms = Math.sqrt(sum / samples.length)
      const now = performance.now()
      if (rms > SPEECH_THRESHOLD) {
        speechSeen = true
        silenceStart = 0
      } else if (speechSeen) {
        if (silenceStart === 0) silenceStart = now
        else if (now - silenceStart > SILENCE_MS) stopRecording()
      }
    }, 120)
    // Garde-fou : on ne laisse pas l'enregistrement tourner indefiniment.
    maxTimer = setTimeout(() => stopRecording(), MAX_RECORDING_MS)
  } catch {
    // Analyse audio indisponible : on garde le mode manuel (clic sur le micro pour arreter).
  }
}

const canSend = computed(() => draft.value.trim().length > 0 && !chat.streaming)
// On ne montre l'invite de configuration qu'une fois les reglages charges (sinon faux negatif).
const showConfigHint = computed(() => ai.loaded && !ai.configured)
// Message affiche dans la conversation tant que l'assistant n'est pas utilisable, oriente selon
// la cause : cle manquante (le plus courant) ou assistant non active.
const configMessage = computed(() =>
  !ai.hasToken
    ? "Je ne suis pas encore configuree : ajoutez une cle OpenAI dans les reglages pour qu'on puisse discuter."
    : "Activez l'assistant dans les reglages pour commencer.",
)

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

// A l'ouverture, on reclampe une position memorisee qui serait hors de l'ecran (fenetre reduite).
watch(
  () => chat.open,
  (open) => {
    if (!open) return
    // Recharge les reglages a l'ouverture pour que le message "pas de cle" soit fiable.
    if (!ai.loaded) void ai.load()
    if (!position.value && !size.value) return
    void nextTick(() => {
      const el = panelEl.value
      if (!el) return
      const rect = el.getBoundingClientRect()
      dragW = rect.width
      dragH = rect.height
      // Reclampe une position/taille memorisee qui sortirait de l'ecran (fenetre reduite).
      if (position.value) position.value = clampPosition(position.value.x, position.value.y)
      if (size.value) size.value = clampSize(size.value.w, size.value.h)
    })
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
    micError.value = 'Micro indisponible ou acces refuse.'
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
  setupVad(mediaStream)
}

const stopRecording = (): void => {
  if (!recording.value) return
  recording.value = false
  teardownVad()
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
  window.removeEventListener('pointermove', onDrag)
  window.removeEventListener('pointermove', onResize)
  if (recording.value) mediaRecorder?.stop()
  teardownVad()
  releaseStream()
})
</script>

<template>
  <Transition name="ai-panel">
    <section
      v-if="chat.open"
      ref="panelEl"
      :style="panelStyle"
      class="app-no-drag fixed bottom-[6.75rem] right-5 z-[60] flex max-h-[min(60vh,520px)] w-[360px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl bg-ink-900/95 shadow-2xl shadow-black/50 ring-1 ring-white/10 backdrop-blur-md"
    >
      <header
        class="flex cursor-move touch-none select-none items-center gap-2 border-b border-white/10 px-3.5 py-2.5"
        @pointerdown="startDrag"
      >
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
        <div v-if="showConfigHint" class="flex justify-start">
          <div
            class="max-w-[85%] rounded-2xl bg-white/[0.05] px-3 py-2 text-sm leading-6 text-zinc-200 ring-1 ring-white/10"
          >
            <p>{{ configMessage }}</p>
            <button
              type="button"
              class="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent-mint/15 px-3 py-1.5 text-xs font-medium text-accent-mint ring-1 ring-accent-mint/30 transition hover:bg-accent-mint/25"
              @click="openSettings"
            >
              Ouvrir les reglages
            </button>
          </div>
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
            :title="recording ? 'Arreter la dictee maintenant' : 'Dicter au micro'"
            @click="toggleRecording"
          >
            <Loader2 v-if="transcribing" :size="16" class="animate-spin" />
            <Mic v-else :size="16" :class="recording ? 'animate-pulse' : ''" />
          </button>

          <textarea
            v-model="draft"
            rows="1"
            :placeholder="recording ? 'Parlez... (arret automatique au silence)' : 'Ecrire un message...'"
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

      <!-- Poignee de redimensionnement (coin bas-droite) -->
      <div
        class="absolute bottom-0 right-0 z-10 grid size-3.5 cursor-nwse-resize touch-none place-items-center text-zinc-500 transition hover:text-zinc-300"
        title="Redimensionner"
        @pointerdown="startResize"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        >
          <path d="M11 5 L5 11 M11 9 L9 11" />
        </svg>
      </div>
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

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Mic, Video, Volume2, X } from 'lucide-vue-next'
import { useOmnichat } from '@renderer/composables/useOmnichat'
import connectedUrl from '@renderer/assets/sounds/call-connected.mp3'

const omnichat = useOmnichat()
const settings = omnichat.mediaSettings

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const audioInputs = ref<MediaDeviceInfo[]>([])
const audioOutputs = ref<MediaDeviceInfo[]>([])
const videoInputs = ref<MediaDeviceInfo[]>([])
const level = ref(0)
const error = ref<string | null>(null)

// Tous les Chromium recents exposent setSinkId sur HTMLMediaElement, mais on garde
// un garde-fou pour les rares cas (vieux Electron, contextes non securises) ou il manque.
const supportsSinkId = ref(
  typeof (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId === 'function',
)

let testStream: MediaStream | null = null
let audioCtx: AudioContext | null = null
let raf = 0

const stopMicTest = (): void => {
  if (raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
  if (audioCtx) {
    void audioCtx.close()
    audioCtx = null
  }
  if (testStream) {
    for (const track of testStream.getTracks()) {
      track.stop()
    }
    testStream = null
  }
  level.value = 0
}

// Liste les peripheriques visibles. Tant que getUserMedia n'a pas ete acceptee au
// moins une fois, les labels sont vides : on s'attend a etre rappele apres startMicTest.
const enumerate = async (): Promise<void> => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    audioInputs.value = devices.filter((d) => d.kind === 'audioinput' && d.deviceId)
    audioOutputs.value = devices.filter((d) => d.kind === 'audiooutput' && d.deviceId)
    videoInputs.value = devices.filter((d) => d.kind === 'videoinput' && d.deviceId)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Enumeration des peripheriques impossible.'
  }
}

// Ouvre un flux micro a part (independant de l'appel) et alimente un vu-metre temps reel
// via un AnalyserNode. Sert aussi a debloquer les labels d'enumerateDevices.
const startMicTest = async (): Promise<void> => {
  stopMicTest()
  try {
    testStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: settings.audioInputId ? { exact: settings.audioInputId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    await enumerate()
    audioCtx = new AudioContext()
    const source = audioCtx.createMediaStreamSource(testStream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    const tick = (): void => {
      analyser.getByteTimeDomainData(data)
      let peak = 0
      for (let i = 0; i < data.length; i += 1) {
        const sample = data[i] ?? 128
        const v = Math.abs(sample - 128) / 128
        if (v > peak) peak = v
      }
      level.value = peak
      raf = requestAnimationFrame(tick)
    }
    tick()
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Acces au micro refuse."
  }
}

const onChangeAudioInput = async (event: Event): Promise<void> => {
  const deviceId = (event.target as HTMLSelectElement).value
  await omnichat.setMediaDevice('audioinput', deviceId)
  await startMicTest()
}

const onChangeAudioOutput = async (event: Event): Promise<void> => {
  const deviceId = (event.target as HTMLSelectElement).value
  await omnichat.setMediaDevice('audiooutput', deviceId)
}

const onChangeVideoInput = async (event: Event): Promise<void> => {
  const deviceId = (event.target as HTMLSelectElement).value
  await omnichat.setMediaDevice('videoinput', deviceId)
}

// Joue un petit jingle sur la sortie selectionnee. setSinkId doit etre appelee AVANT play()
// sous peine d'etre ignoree par certains navigateurs.
const playOutputTest = async (): Promise<void> => {
  const el = new Audio(connectedUrl)
  el.volume = 0.7
  if (settings.audioOutputId) {
    const sinkable = el as HTMLAudioElement & {
      setSinkId?: (id: string) => Promise<void>
    }
    if (typeof sinkable.setSinkId === 'function') {
      try {
        await sinkable.setSinkId(settings.audioOutputId)
      } catch {
        // Sortie indisponible : on joue quand meme sur la sortie par defaut.
      }
    }
  }
  try {
    await el.play()
  } catch {
    // Lecture refusee (rare) : on ignore.
  }
}

const onDeviceChange = (): void => {
  void enumerate()
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      error.value = null
      navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
      void (async () => {
        await enumerate()
        await startMicTest()
      })()
    } else {
      navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
      stopMicTest()
    }
  },
)

onBeforeUnmount(() => {
  navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
  stopMicTest()
})
</script>

<template>
  <Transition
    enter-active-class="transition duration-150 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-100 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="open"
      class="absolute inset-0 z-[80] grid place-items-center bg-ink-950/70 p-6"
      role="dialog"
      aria-modal="true"
      @click.self="emit('close')"
    >
      <div class="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-900 shadow-lift">
        <header class="flex items-center justify-between border-b border-white/[0.05] px-5 py-3">
          <h2 class="text-sm font-semibold text-white">Peripheriques audio et video</h2>
          <button
            class="grid size-8 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
            type="button"
            title="Fermer"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </header>

        <div class="space-y-5 px-5 py-4">
          <p v-if="error" class="rounded-md border border-accent-coral/30 bg-accent-coral/10 px-3 py-2 text-xs text-accent-coral">
            {{ error }}
          </p>

          <section class="space-y-2">
            <label class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              <Mic :size="13" /> Microphone
            </label>
            <select
              class="w-full rounded-md bg-ink-950/55 px-3 py-2 text-sm text-white outline-none"
              :value="settings.audioInputId"
              @change="onChangeAudioInput"
            >
              <option value="">Par defaut du systeme</option>
              <option v-for="d in audioInputs" :key="d.deviceId" :value="d.deviceId">
                {{ d.label || 'Micro sans nom' }}
              </option>
            </select>
            <div class="h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                class="h-full rounded-full transition-[width] duration-75"
                :class="level > 0.6 ? 'bg-accent-coral' : level > 0.2 ? 'bg-accent-mint' : 'bg-accent-mint/60'"
                :style="{ width: `${Math.min(100, Math.round(level * 140))}%` }"
              />
            </div>
            <p class="text-[11px] text-zinc-500">Parle dans le micro : la barre doit reagir.</p>
          </section>

          <section class="space-y-2">
            <label class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              <Volume2 :size="13" /> Sortie audio
            </label>
            <select
              v-if="supportsSinkId"
              class="w-full rounded-md bg-ink-950/55 px-3 py-2 text-sm text-white outline-none"
              :value="settings.audioOutputId"
              @change="onChangeAudioOutput"
            >
              <option value="">Par defaut du systeme</option>
              <option v-for="d in audioOutputs" :key="d.deviceId" :value="d.deviceId">
                {{ d.label || 'Sortie sans nom' }}
              </option>
            </select>
            <p v-else class="text-[11px] text-zinc-500">
              La selection de sortie n'est pas disponible sur ce systeme.
            </p>
            <button
              v-if="supportsSinkId"
              class="rounded-md bg-white/[0.06] px-3 py-1.5 text-xs text-zinc-200 transition hover:bg-white/[0.1]"
              type="button"
              @click="playOutputTest"
            >
              Tester la sortie
            </button>
          </section>

          <section class="space-y-2">
            <label class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              <Video :size="13" /> Camera
            </label>
            <select
              class="w-full rounded-md bg-ink-950/55 px-3 py-2 text-sm text-white outline-none"
              :value="settings.videoInputId"
              @change="onChangeVideoInput"
            >
              <option value="">Par defaut du systeme</option>
              <option v-for="d in videoInputs" :key="d.deviceId" :value="d.deviceId">
                {{ d.label || 'Camera sans nom' }}
              </option>
            </select>
          </section>
        </div>
      </div>
    </div>
  </Transition>
</template>

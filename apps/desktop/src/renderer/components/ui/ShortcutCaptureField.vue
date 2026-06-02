<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { chordToAccelerator, formatAccelerator } from '@shared/shortcuts'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()

const isMac = navigator.platform.toUpperCase().includes('MAC')
const capturing = ref(false)
const buttonRef = ref<HTMLButtonElement | null>(null)

const display = computed(() => formatAccelerator(props.modelValue, isMac))

// Demande au main de suspendre / restaurer le menu applicatif natif : sans cela ses
// accelerateurs (Cmd+R, Cmd+T, Cmd+1...) intercepteraient la frappe avant le renderer.
// Ce canal suspend l'integralite du menu (raccourcis navigateur ET navigation), il
// convient donc a tous les champs de capture, pas seulement a ceux d'OmniBrowser.
const setNativeCaptureMode = (value: boolean): void => {
  void window.omnidesk?.omnibrowser?.shortcuts?.setCaptureMode(value)
}

const startCapture = (): void => {
  if (capturing.value) {
    return
  }
  capturing.value = true
  setNativeCaptureMode(true)
}

const stopCapture = (): void => {
  if (!capturing.value) {
    return
  }
  capturing.value = false
  setNativeCaptureMode(false)
}

// Filet de securite : si le champ est demonte (fermeture du dialogue) pendant une
// capture, on restaure quand meme le menu natif.
onBeforeUnmount(stopCapture)

const onKeydown = (event: KeyboardEvent): void => {
  if (!capturing.value) {
    return
  }
  event.preventDefault()
  event.stopPropagation()

  const hasModifier = event.metaKey || event.ctrlKey || event.altKey || event.shiftKey
  // Echap seul annule la capture (Echap + modificateurs reste un raccourci valide).
  if (event.code === 'Escape' && !hasModifier) {
    stopCapture()
    buttonRef.value?.blur()
    return
  }

  const accelerator = chordToAccelerator(
    {
      meta: event.metaKey,
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      code: event.code,
    },
    isMac,
  )
  if (accelerator) {
    emit('update:modelValue', accelerator)
    stopCapture()
    buttonRef.value?.blur()
  }
}
</script>

<template>
  <button
    ref="buttonRef"
    type="button"
    class="min-w-[88px] rounded-lg px-3 py-1.5 text-center text-xs font-medium tabular-nums transition"
    :class="
      capturing
        ? 'bg-accent-mint/15 text-accent-mint ring-1 ring-accent-mint/50'
        : 'bg-white/[0.06] text-zinc-200 hover:bg-white/[0.1]'
    "
    @click="startCapture"
    @keydown="onKeydown"
    @blur="stopCapture"
  >
    {{ capturing ? 'Appuyez sur une touche...' : display }}
  </button>
</template>

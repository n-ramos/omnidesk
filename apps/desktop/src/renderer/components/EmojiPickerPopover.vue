<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { Smile } from 'lucide-vue-next'
import EmojiPicker, { type EmojiSelectEvent } from 'vue3-emoji-picker'
import 'vue3-emoji-picker/css'

const emit = defineEmits<{
  select: [emoji: string]
}>()

const isOpen = ref(false)
const wrapperRef = ref<HTMLElement | null>(null)

const toggle = (): void => {
  isOpen.value = !isOpen.value
}

const close = (): void => {
  isOpen.value = false
}

const onSelect = (event: EmojiSelectEvent): void => {
  emit('select', event.i)
  close()
}

const onDocumentClick = (event: MouseEvent): void => {
  if (!isOpen.value) {
    return
  }

  const target = event.target as Node | null
  if (target && wrapperRef.value && !wrapperRef.value.contains(target)) {
    close()
  }
}

const onKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape' && isOpen.value) {
    close()
  }
}

document.addEventListener('mousedown', onDocumentClick)
document.addEventListener('keydown', onKeydown)

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="wrapperRef" class="relative">
    <button
      class="grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-30"
      type="button"
      :title="isOpen ? 'Fermer le selecteur d\'emoji' : 'Inserer un emoji'"
      :aria-expanded="isOpen"
      @click="toggle"
    >
      <Smile :size="15" />
    </button>

    <div
      v-if="isOpen"
      class="absolute bottom-full left-0 z-50 mb-2 overflow-hidden rounded-xl shadow-lift"
    >
      <EmojiPicker
        :native="true"
        theme="dark"
        :disable-sticky-group-icons="true"
        @select="onSelect"
      />
    </div>
  </div>
</template>

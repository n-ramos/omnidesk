<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { SmilePlus } from 'lucide-vue-next'
import EmojiPicker, { type EmojiSelectEvent } from 'vue3-emoji-picker'
import 'vue3-emoji-picker/css'
import { get as getEmoji } from 'node-emoji'
import {
  slackShortcodeFromUnicode,
  unicodeFromSlackShortcode,
} from '@shared/slackEmoji'
import type { MessageReactionSummary } from '@shared/models'

const props = defineProps<{
  reactions?: MessageReactionSummary[]
  align?: 'start' | 'end'
}>()

const emit = defineEmits<{
  toggle: [name: string]
}>()

const visibleReactions = computed(() => props.reactions ?? [])
const alignClass = computed(() => (props.align === 'end' ? 'justify-end' : 'justify-start'))

const isPickerOpen = ref(false)
const wrapperRef = ref<HTMLElement | null>(null)

const renderReaction = (reaction: MessageReactionSummary): string => {
  return (
    unicodeFromSlackShortcode(reaction.name)
    || getEmoji(reaction.name)
    || `:${reaction.name}:`
  )
}

const togglePicker = (): void => {
  isPickerOpen.value = !isPickerOpen.value
}

const closePicker = (): void => {
  isPickerOpen.value = false
}

const onEmojiSelected = (event: EmojiSelectEvent): void => {
  const shortcode =
    slackShortcodeFromUnicode(event.u)
    ?? slackShortcodeFromUnicode(event.r)
    ?? event.n[0]?.replace(/\s+/g, '_').toLowerCase()
  if (!shortcode) {
    return
  }

  emit('toggle', shortcode)
  closePicker()
}

const onReactionClick = (reaction: MessageReactionSummary): void => {
  emit('toggle', reaction.name)
}

const onDocumentClick = (event: MouseEvent): void => {
  if (!isPickerOpen.value) {
    return
  }

  const target = event.target as Node | null
  if (target && wrapperRef.value && !wrapperRef.value.contains(target)) {
    closePicker()
  }
}

const onKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape' && isPickerOpen.value) {
    closePicker()
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
  <div
    v-if="visibleReactions.length > 0 || isPickerOpen"
    ref="wrapperRef"
    class="relative flex flex-wrap items-center gap-1"
    :class="alignClass"
  >
    <button
      v-for="reaction in visibleReactions"
      :key="reaction.name"
      class="flex h-7 items-center gap-1.5 rounded-full border px-2 text-xs font-medium transition"
      :class="
        reaction.mine
          ? 'border-accent-mint/40 bg-accent-mint/15 text-accent-mint'
          : 'border-white/[0.06] bg-white/[0.04] text-zinc-300 hover:border-white/15 hover:bg-white/[0.08]'
      "
      type="button"
      :title="`:${reaction.name}:`"
      @click="onReactionClick(reaction)"
    >
      <span class="text-base leading-none">{{ renderReaction(reaction) }}</span>
      <span class="tabular-nums">{{ reaction.count }}</span>
    </button>

    <button
      class="grid size-7 place-items-center rounded-full border border-white/[0.04] bg-white/[0.04] text-zinc-400 transition hover:border-white/15 hover:bg-white/[0.08] hover:text-zinc-200"
      type="button"
      :title="isPickerOpen ? 'Fermer le menu de reaction' : 'Ajouter une reaction'"
      :aria-expanded="isPickerOpen"
      @click="togglePicker"
    >
      <SmilePlus :size="14" />
    </button>

    <div
      v-if="isPickerOpen"
      class="absolute bottom-full z-30 mb-1 overflow-hidden rounded-xl shadow-lift"
      :class="props.align === 'end' ? 'right-0' : 'left-0'"
    >
      <EmojiPicker
        :native="true"
        theme="dark"
        :disable-sticky-group-icons="true"
        @select="onEmojiSelected"
      />
    </div>
  </div>

  <div
    v-else
    ref="wrapperRef"
    class="relative flex items-center opacity-0 transition-opacity duration-150 group-hover/message:opacity-100"
    :class="alignClass"
  >
    <button
      class="grid size-7 place-items-center rounded-full border border-white/[0.04] bg-white/[0.04] text-zinc-400 transition hover:border-white/15 hover:bg-white/[0.08] hover:text-zinc-200"
      type="button"
      title="Ajouter une reaction"
      :aria-expanded="false"
      @click="togglePicker"
    >
      <SmilePlus :size="14" />
    </button>
  </div>
</template>

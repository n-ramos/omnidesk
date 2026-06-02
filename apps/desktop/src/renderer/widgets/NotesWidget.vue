<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Check, NotebookPen, Pencil } from 'lucide-vue-next'

interface NotesConfig {
  content?: string
}

const props = defineProps<{
  config?: NotesConfig
  editMode: boolean
}>()

const emit = defineEmits<{
  (event: 'update:config', value: NotesConfig): void
}>()

const draft = ref(props.config?.content ?? '')
const isEditing = ref(false)
let saveTimer: ReturnType<typeof setTimeout> | undefined

const persistedContent = computed(() => props.config?.content ?? '')

watch(persistedContent, (value) => {
  if (!isEditing.value) {
    draft.value = value
  }
})

const flushSave = (): void => {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  if (draft.value !== persistedContent.value) {
    emit('update:config', { content: draft.value })
  }
}

const onInput = (): void => {
  if (saveTimer) {
    clearTimeout(saveTimer)
  }
  saveTimer = setTimeout(() => {
    if (draft.value !== persistedContent.value) {
      emit('update:config', { content: draft.value })
    }
    saveTimer = undefined
  }, 600)
}

const toggleEditing = (): void => {
  if (isEditing.value) {
    flushSave()
  }
  isEditing.value = !isEditing.value
}

onBeforeUnmount(() => {
  flushSave()
})

const renderedLines = computed(() => {
  const text = persistedContent.value
  if (!text) {
    return []
  }
  return text.split(/\r?\n/)
})

const isUrl = (token: string): boolean => /^https?:\/\/\S+$/i.test(token)
</script>

<template>
  <div class="flex h-full flex-col p-5">
    <div class="mb-3 flex items-center justify-between">
      <span class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        <NotebookPen :size="13" />
        Notes
      </span>
      <button
        class="grid size-7 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
        :title="isEditing ? 'Enregistrer' : 'Modifier'"
        type="button"
        @click="toggleEditing"
      >
        <Check v-if="isEditing" :size="13" />
        <Pencil v-else :size="13" />
      </button>
    </div>

    <textarea
      v-if="isEditing"
      v-model="draft"
      class="scroll-thin min-h-0 w-full flex-1 resize-none rounded-lg bg-ink-950/70 p-3 text-sm leading-6 text-zinc-100 outline-none ring-1 ring-white/5 focus:ring-accent-mint/40"
      placeholder="Tapez vos notes ici..."
      @blur="flushSave"
      @input="onInput"
    />

    <div
      v-else-if="renderedLines.length === 0"
      class="flex flex-1 items-center justify-center text-sm text-zinc-500"
    >
      <button class="hover:text-zinc-200" type="button" @click="toggleEditing">
        Cliquez ici pour commencer une note.
      </button>
    </div>

    <div v-else class="scroll-thin min-h-0 flex-1 overflow-auto text-sm leading-6 text-zinc-200">
      <p v-for="(line, index) in renderedLines" :key="index" class="whitespace-pre-wrap">
        <template v-for="(token, tokenIndex) in line.split(/(\s+)/)" :key="tokenIndex">
          <a
            v-if="isUrl(token)"
            :href="token"
            class="text-accent-sky underline-offset-2 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >{{ token }}</a>
          <template v-else>{{ token }}</template>
        </template>
        <br v-if="line === ''" />
      </p>
    </div>
  </div>
</template>

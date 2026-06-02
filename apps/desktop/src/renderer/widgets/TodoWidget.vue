<script setup lang="ts">
import { computed, ref } from 'vue'
import { CheckSquare, ListChecks, Plus, Square, Trash2 } from 'lucide-vue-next'

interface TodoItem {
  id: string
  text: string
  done: boolean
  createdAt: string
}

interface TodoConfig {
  items?: TodoItem[]
}

const props = defineProps<{
  config?: TodoConfig
  editMode: boolean
}>()

const emit = defineEmits<{
  (event: 'update:config', value: TodoConfig): void
}>()

const draftText = ref('')

const items = computed<TodoItem[]>(() => {
  const raw = props.config?.items
  return Array.isArray(raw) ? raw : []
})

const remainingCount = computed(() => items.value.filter((item) => !item.done).length)

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `todo-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const persist = (next: TodoItem[]): void => {
  emit('update:config', { items: next })
}

const addItem = (): void => {
  const text = draftText.value.trim()
  if (!text) {
    return
  }
  const next: TodoItem = {
    id: generateId(),
    text,
    done: false,
    createdAt: new Date().toISOString(),
  }
  persist([...items.value, next])
  draftText.value = ''
}

const toggleItem = (id: string): void => {
  persist(items.value.map((item) => (item.id === id ? { ...item, done: !item.done } : item)))
}

const removeItem = (id: string): void => {
  persist(items.value.filter((item) => item.id !== id))
}

const clearDone = (): void => {
  persist(items.value.filter((item) => !item.done))
}

const hasDone = computed(() => items.value.some((item) => item.done))
</script>

<template>
  <div class="flex h-full flex-col p-5">
    <div class="mb-3 flex items-center justify-between">
      <span class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        <ListChecks :size="13" />
        A faire
      </span>
      <span class="text-[11px] text-zinc-500 tabular-nums">{{ remainingCount }} restant(s)</span>
    </div>

    <form class="mb-3 flex gap-2" @submit.prevent="addItem">
      <input
        v-model="draftText"
        class="min-w-0 flex-1 rounded-lg bg-ink-950/70 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-white/5 focus:ring-accent-mint/40"
        placeholder="Nouvelle tache"
        type="text"
      />
      <button
        class="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-mint text-ink-950 transition hover:brightness-110 disabled:opacity-40"
        :disabled="!draftText.trim()"
        title="Ajouter"
        type="submit"
      >
        <Plus :size="14" />
      </button>
    </form>

    <div v-if="items.length === 0" class="flex flex-1 items-center justify-center text-sm text-zinc-500">
      Rien a faire pour le moment.
    </div>

    <ul v-else class="scroll-thin grid min-h-0 flex-1 content-start gap-1 overflow-auto">
      <li
        v-for="item in items"
        :key="item.id"
        class="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.04]"
      >
        <button
          class="grid size-6 shrink-0 place-items-center rounded-md text-zinc-400 transition hover:text-zinc-100"
          :title="item.done ? 'Marquer non fait' : 'Marquer fait'"
          type="button"
          @click="toggleItem(item.id)"
        >
          <CheckSquare v-if="item.done" :size="15" class="text-accent-mint" />
          <Square v-else :size="15" />
        </button>
        <span
          class="min-w-0 flex-1 text-sm"
          :class="item.done ? 'text-zinc-500 line-through' : 'text-zinc-100'"
        >
          {{ item.text }}
        </span>
        <button
          class="grid size-6 shrink-0 place-items-center rounded-md text-zinc-500 opacity-0 transition hover:bg-accent-coral/10 hover:text-accent-coral group-hover:opacity-100"
          title="Supprimer"
          type="button"
          @click="removeItem(item.id)"
        >
          <Trash2 :size="13" />
        </button>
      </li>
    </ul>

    <button
      v-if="hasDone"
      class="mt-2 self-start text-[11px] text-zinc-500 transition hover:text-zinc-200"
      type="button"
      @click="clearDone"
    >
      Effacer les taches faites
    </button>
  </div>
</template>

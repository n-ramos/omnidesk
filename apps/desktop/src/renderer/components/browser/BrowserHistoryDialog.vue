<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Globe, History, Search, Trash2, X } from 'lucide-vue-next'
import { useBrowserStore } from '@renderer/stores/browserStore'
import type { BrowserHistoryEntry } from '@shared/models'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (event: 'close'): void }>()

const store = useBrowserStore()
const query = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | undefined

watch(
  () => props.open,
  (open) => {
    if (open) {
      query.value = ''
      void store.loadHistory()
    }
  },
)

const onSearch = (): void => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  debounceTimer = setTimeout(() => {
    void store.searchHistory(query.value)
  }, 180)
}

// Les dates SQLite (datetime('now')) sont en UTC sans fuseau : on normalise en Date.
const toDate = (iso: string): Date =>
  new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`)

const dayLabel = (iso: string): string => {
  const date = toDate(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayMs = 24 * 60 * 60 * 1000
  const diffDays = Math.floor((startOfToday.getTime() - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / dayMs)
  if (diffDays <= 0) return "Aujourd'hui"
  if (diffDays === 1) return 'Hier'
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

const timeLabel = (iso: string): string =>
  toDate(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

const groups = computed(() => {
  const map = new Map<string, BrowserHistoryEntry[]>()
  for (const entry of store.history) {
    const label = dayLabel(entry.lastVisitedAt)
    const bucket = map.get(label) ?? []
    bucket.push(entry)
    map.set(label, bucket)
  }
  return [...map.entries()]
})

const openEntry = (entry: BrowserHistoryEntry): void => {
  store.openUrl(entry.url)
  emit('close')
}
</script>

<template>
  <div
    v-if="open"
    class="app-no-drag absolute inset-0 z-40 overflow-hidden bg-black/52 p-6 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <section class="mx-auto my-8 flex h-[calc(100%-4rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-ink-900 shadow-soft shadow-line">
      <header class="flex items-center justify-between border-b border-white/[0.04] px-5 py-4">
        <div class="flex items-center gap-2">
          <History :size="18" class="text-accent-mint" />
          <h2 class="text-lg font-semibold text-white">Historique</h2>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition hover:bg-accent-coral/10 hover:text-accent-coral"
            :disabled="store.history.length === 0"
            @click="store.clearHistory()"
          >
            <Trash2 :size="14" /> Tout effacer
          </button>
          <button
            aria-label="Fermer"
            class="grid size-9 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
            type="button"
            @click="emit('close')"
          >
            <X :size="18" />
          </button>
        </div>
      </header>

      <div class="border-b border-white/[0.04] p-3">
        <div class="relative flex items-center">
          <Search :size="14" class="pointer-events-none absolute left-3 text-zinc-500" />
          <input
            v-model="query"
            type="text"
            placeholder="Rechercher dans l'historique"
            class="h-9 w-full rounded-lg bg-white/[0.04] pl-9 pr-3 text-sm text-zinc-100 outline-none transition focus:bg-white/[0.07]"
            @input="onSearch"
          />
        </div>
      </div>

      <div class="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
        <div
          v-if="store.history.length === 0"
          class="grid h-full place-items-center text-sm text-zinc-500"
        >
          Aucune entrée d'historique.
        </div>

        <div v-for="[label, entries] in groups" :key="label" class="mb-4">
          <p class="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            {{ label }}
          </p>
          <div class="flex flex-col gap-0.5">
            <div
              v-for="entry in entries"
              :key="entry.id"
              class="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.05]"
            >
              <span class="w-12 shrink-0 text-xs tabular-nums text-zinc-600">{{ timeLabel(entry.lastVisitedAt) }}</span>
              <img
                v-if="entry.faviconUrl"
                :src="entry.faviconUrl"
                alt=""
                referrerpolicy="no-referrer"
                class="size-4 shrink-0 rounded-sm object-contain"
              />
              <Globe v-else :size="14" class="shrink-0 text-zinc-600" />
              <button
                type="button"
                class="flex min-w-0 flex-1 flex-col items-start text-left"
                @click="openEntry(entry)"
              >
                <span class="w-full truncate text-sm text-zinc-200">{{ entry.title || entry.url }}</span>
                <span class="w-full truncate text-xs text-zinc-600">{{ entry.url }}</span>
              </button>
              <span v-if="entry.visitCount > 1" class="shrink-0 text-xs text-zinc-600">{{ entry.visitCount }}×</span>
              <button
                type="button"
                class="grid size-6 shrink-0 place-items-center rounded text-zinc-600 opacity-0 transition hover:bg-white/[0.1] hover:text-accent-coral group-hover:opacity-100"
                title="Supprimer"
                @click="store.deleteHistoryEntry(entry.id)"
              >
                <X :size="13" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

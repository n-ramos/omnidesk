<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  ExternalLink,
  Globe,
  History,
  PanelLeft,
  RotateCw,
  Search,
  Settings,
  Shield,
  ShieldOff,
  Star,
  VenetianMask,
} from 'lucide-vue-next'
import { useBrowserStore } from '@renderer/stores/browserStore'
import type { OmniboxSuggestion } from '@shared/models'

const emit = defineEmits<{ (event: 'open-settings'): void; (event: 'open-history'): void }>()

const store = useBrowserStore()

const inputRef = ref<HTMLInputElement | null>(null)
const query = ref('')
const focused = ref(false)
const highlight = ref(-1)
let debounceTimer: ReturnType<typeof setTimeout> | undefined

// Focus demande par Cmd/Ctrl+T (jeton incremente dans le store).
watch(
  () => store.omniboxFocusToken,
  () => {
    void nextTick(() => {
      inputRef.value?.focus()
      inputRef.value?.select()
    })
  },
)

const activeTab = computed(() => store.activeTab)
const activeSpace = computed(() => store.activeSpace)
const suggestions = computed<OmniboxSuggestion[]>(() => store.omniboxSuggestions)
const showSuggestions = computed(() => store.omniboxOpen && suggestions.value.length > 0)

const displayValue = computed(() => (focused.value ? query.value : activeTab.value?.url ?? ''))

const isCurrentBookmarked = computed(() => {
  const url = activeTab.value?.url
  return Boolean(url) && store.bookmarks.some((bookmark) => bookmark.url === url)
})

const onFocus = (): void => {
  focused.value = true
  query.value = activeTab.value?.url ?? ''
  store.omniboxOpen = true
  highlight.value = -1
  void store.fetchSuggestions(query.value)
  void nextTick(() => inputRef.value?.select())
}

const onBlur = (): void => {
  // Laisser le temps au clic sur une suggestion de se declencher.
  setTimeout(() => {
    focused.value = false
    store.omniboxOpen = false
  }, 120)
}

const onInput = (): void => {
  store.omniboxOpen = true
  highlight.value = -1
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  debounceTimer = setTimeout(() => {
    void store.fetchSuggestions(query.value)
  }, 120)
}

const submit = (): void => {
  const chosen = highlight.value >= 0 ? suggestions.value[highlight.value] : undefined
  if (chosen) {
    void store.navigateActiveTab(chosen.url)
  } else if (query.value.trim().length > 0) {
    void store.navigateActiveTab(query.value)
  }
  inputRef.value?.blur()
}

const pickSuggestion = (suggestion: OmniboxSuggestion): void => {
  void store.navigateActiveTab(suggestion.url)
  inputRef.value?.blur()
}

const moveHighlight = (delta: number): void => {
  const count = suggestions.value.length
  if (count === 0) {
    return
  }
  highlight.value = (highlight.value + delta + count) % count
}

const toggleBookmark = (): void => {
  const tab = activeTab.value
  if (!tab || !/^https?:\/\//i.test(tab.url)) {
    return
  }
  if (isCurrentBookmarked.value) {
    const existing = store.bookmarks.find((bookmark) => bookmark.url === tab.url)
    if (existing) {
      void store.removeBookmark(existing.id)
    }
  } else {
    void store.addBookmarkFromActiveTab()
  }
}

const openExternal = (): void => {
  const url = activeTab.value?.url
  if (url) {
    void window.omnidesk?.shell.openExternal(url)
  }
}

const suggestionIcon = (kind: OmniboxSuggestion['kind']) => {
  switch (kind) {
    case 'search':
      return Search
    case 'bookmark':
      return Star
    case 'history':
      return History
    default:
      return Globe
  }
}
</script>

<template>
  <div class="relative flex items-center gap-2 border-b border-white/[0.04] px-3 py-2">
    <button
      type="button"
      class="app-no-drag grid size-9 place-items-center rounded-lg transition hover:bg-white/[0.06]"
      :class="store.settings.sidebarCollapsed ? 'text-accent-mint' : 'text-zinc-400 hover:text-zinc-100'"
      :title="store.settings.sidebarCollapsed ? 'Afficher la barre latérale' : 'Masquer la barre latérale'"
      @click="store.toggleSidebar()"
    >
      <PanelLeft :size="16" />
    </button>
    <button
      type="button"
      class="app-no-drag grid size-9 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
      :disabled="!activeTab?.canGoBack"
      title="Précédent"
      @click="store.backActiveTab()"
    >
      <ArrowLeft :size="16" />
    </button>
    <button
      type="button"
      class="app-no-drag grid size-9 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
      :disabled="!activeTab?.canGoForward"
      title="Suivant"
      @click="store.forwardActiveTab()"
    >
      <ArrowRight :size="16" />
    </button>
    <button
      type="button"
      class="app-no-drag grid size-9 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
      title="Recharger"
      @click="store.reloadActiveTab()"
    >
      <RotateCw :size="16" />
    </button>

    <div class="relative flex min-w-0 flex-1 items-center">
      <Search :size="14" class="pointer-events-none absolute left-3 text-zinc-500" />
      <input
        ref="inputRef"
        :value="displayValue"
        type="text"
        spellcheck="false"
        placeholder="Rechercher ou saisir une adresse"
        class="app-no-drag h-9 w-full rounded-lg bg-white/[0.04] pl-9 pr-3 text-sm text-zinc-100 outline-none transition focus:bg-white/[0.07]"
        :class="store.privateMode ? 'ring-1 ring-violet-500/50' : ''"
        @focus="onFocus"
        @blur="onBlur"
        @input="(event) => { query = (event.target as HTMLInputElement).value; onInput() }"
        @keydown.enter.prevent="submit"
        @keydown.down.prevent="moveHighlight(1)"
        @keydown.up.prevent="moveHighlight(-1)"
        @keydown.esc="inputRef?.blur()"
      />

      <div
        v-if="showSuggestions"
        class="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-white/[0.06] bg-ink-925/98 py-1 shadow-lift backdrop-blur"
      >
        <button
          v-for="(suggestion, index) in suggestions"
          :key="`${suggestion.kind}-${suggestion.url}`"
          type="button"
          class="flex w-full items-center gap-3 px-3 py-2 text-left transition"
          :class="index === highlight ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'"
          @mousedown.prevent="pickSuggestion(suggestion)"
          @mouseenter="highlight = index"
        >
          <component :is="suggestionIcon(suggestion.kind)" :size="15" class="shrink-0 text-zinc-500" />
          <span class="min-w-0 flex-1 truncate text-sm text-zinc-200">{{ suggestion.title }}</span>
          <span class="shrink-0 truncate text-xs text-zinc-600">{{ suggestion.url }}</span>
        </button>
      </div>
    </div>

    <button
      type="button"
      class="app-no-drag grid size-9 place-items-center rounded-lg transition hover:bg-white/[0.06]"
      :class="isCurrentBookmarked ? 'text-accent-gold' : 'text-zinc-400 hover:text-zinc-100'"
      :title="isCurrentBookmarked ? 'Retirer des favoris' : 'Ajouter aux favoris'"
      @click="toggleBookmark"
    >
      <Bookmark :size="16" :fill="isCurrentBookmarked ? 'currentColor' : 'none'" />
    </button>

    <button
      type="button"
      class="app-no-drag grid size-9 place-items-center rounded-lg transition hover:bg-white/[0.06]"
      :class="activeSpace?.adBlock ? 'text-accent-mint' : 'text-zinc-400 hover:text-zinc-100'"
      :title="activeSpace?.adBlock ? 'Blocage des pubs actif' : 'Bloquer les pubs et trackers'"
      @click="store.setSpaceAdBlock(!activeSpace?.adBlock)"
    >
      <component :is="activeSpace?.adBlock ? Shield : ShieldOff" :size="16" />
    </button>

    <button
      type="button"
      class="app-no-drag grid size-9 place-items-center rounded-lg transition hover:bg-white/[0.06]"
      :class="store.privateMode ? 'text-violet-400' : 'text-zinc-400 hover:text-zinc-100'"
      :title="store.privateMode ? 'Quitter la navigation privée' : 'Navigation privée'"
      @click="store.togglePrivateMode()"
    >
      <VenetianMask :size="16" />
    </button>

    <button
      type="button"
      class="app-no-drag grid size-9 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
      title="Ouvrir dans le navigateur système"
      @click="openExternal"
    >
      <ExternalLink :size="16" />
    </button>

    <button
      type="button"
      class="app-no-drag grid size-9 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
      title="Historique de navigation"
      @click="emit('open-history')"
    >
      <History :size="16" />
    </button>

    <button
      type="button"
      class="app-no-drag grid size-9 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
      title="Paramètres OmniBrowser (moteur de recherche, raccourcis, extensions)"
      @click="emit('open-settings')"
    >
      <Settings :size="16" />
    </button>
  </div>
</template>

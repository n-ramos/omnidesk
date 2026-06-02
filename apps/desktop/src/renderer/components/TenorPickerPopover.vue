<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { ImagePlay, Search } from 'lucide-vue-next'
import Spinner from '@renderer/components/ui/Spinner.vue'
import type { TenorGifResult } from '@shared/models'

const emit = defineEmits<{
  select: [gif: TenorGifResult]
}>()

const isOpen = ref(false)
const isReady = ref<boolean | undefined>(undefined)
const wrapperRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const query = ref('')
const results = ref<TenorGifResult[]>([])
const isLoading = ref(false)
const errorMessage = ref<string | undefined>(undefined)
let searchTimer: ReturnType<typeof setTimeout> | undefined
let activeRequestToken = 0

const ensureStatus = async (): Promise<void> => {
  if (isReady.value !== undefined) {
    return
  }

  const api = window.omnidesk
  if (!api?.tenor?.status) {
    isReady.value = false
    return
  }

  try {
    const status = await api.tenor.status()
    isReady.value = status.ready
  } catch {
    isReady.value = false
  }
}

const loadFeatured = async (): Promise<void> => {
  const api = window.omnidesk
  if (!api?.tenor?.featured) {
    return
  }

  isLoading.value = true
  errorMessage.value = undefined
  const token = ++activeRequestToken

  try {
    const items = await api.tenor.featured(24)
    if (token === activeRequestToken) {
      results.value = items
    }
  } catch (error) {
    if (token === activeRequestToken) {
      errorMessage.value = error instanceof Error
        ? error.message
        : 'Tenor a refuse la requete.'
    }
  } finally {
    if (token === activeRequestToken) {
      isLoading.value = false
    }
  }
}

const runSearch = async (term: string): Promise<void> => {
  const api = window.omnidesk
  if (!api?.tenor?.search) {
    return
  }

  if (!term.trim()) {
    await loadFeatured()
    return
  }

  isLoading.value = true
  errorMessage.value = undefined
  const token = ++activeRequestToken

  try {
    const items = await api.tenor.search(term, 24)
    if (token === activeRequestToken) {
      results.value = items
    }
  } catch (error) {
    if (token === activeRequestToken) {
      errorMessage.value = error instanceof Error
        ? error.message
        : 'Tenor a refuse la requete.'
    }
  } finally {
    if (token === activeRequestToken) {
      isLoading.value = false
    }
  }
}

watch(query, (next) => {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  searchTimer = setTimeout(() => {
    void runSearch(next)
  }, 280)
})

const openPicker = async (): Promise<void> => {
  if (isOpen.value) {
    closePicker()
    return
  }

  await ensureStatus()
  if (!isReady.value) {
    errorMessage.value = "Configurez OMNIDESK_TENOR_API_KEY pour activer les GIFs."
    isOpen.value = true
    return
  }

  isOpen.value = true
  if (results.value.length === 0 && !query.value.trim()) {
    void loadFeatured()
  }

  void Promise.resolve().then(() => {
    searchInputRef.value?.focus()
  })
}

const closePicker = (): void => {
  isOpen.value = false
}

const onGifClick = (gif: TenorGifResult): void => {
  emit('select', gif)
  closePicker()
}

const onDocumentClick = (event: MouseEvent): void => {
  if (!isOpen.value) {
    return
  }

  const target = event.target as Node | null
  if (target && wrapperRef.value && !wrapperRef.value.contains(target)) {
    closePicker()
  }
}

const onKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape' && isOpen.value) {
    closePicker()
  }
}

document.addEventListener('mousedown', onDocumentClick)
document.addEventListener('keydown', onKeydown)

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
})
</script>

<template>
  <div ref="wrapperRef" class="relative">
    <button
      class="grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-30"
      type="button"
      title="Ajouter un GIF (Tenor)"
      :aria-expanded="isOpen"
      @click="openPicker"
    >
      <ImagePlay :size="15" />
    </button>

    <div
      v-if="isOpen"
      class="absolute bottom-full left-0 z-50 mb-2 flex h-[320px] w-[360px] flex-col rounded-2xl border border-white/[0.06] bg-ink-900/95 shadow-lift backdrop-blur"
    >
      <div class="flex items-center gap-2 border-b border-white/[0.04] px-3 py-2">
        <Search :size="14" class="text-zinc-500" />
        <input
          ref="searchInputRef"
          v-model="query"
          type="text"
          class="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-600 outline-none"
          placeholder="Rechercher un GIF..."
        />
      </div>

      <div class="flex-1 overflow-y-auto p-2">
        <p v-if="errorMessage" class="px-2 py-3 text-xs text-rose-300">
          {{ errorMessage }}
        </p>
        <div
          v-else-if="isLoading"
          class="flex items-center justify-center gap-2 px-2 py-3 text-xs text-zinc-500"
        >
          <Spinner :size="14" label="Recherche de GIFs" />
          <span>Chargement...</span>
        </div>
        <p
          v-else-if="results.length === 0"
          class="px-2 py-3 text-xs text-zinc-500"
        >
          Aucun GIF a afficher.
        </p>
        <div v-else class="grid grid-cols-2 gap-2">
          <button
            v-for="gif in results"
            :key="gif.id"
            class="overflow-hidden rounded-lg border border-transparent transition hover:border-accent-mint/40 focus:outline-none focus:ring-1 focus:ring-accent-mint/50"
            type="button"
            :title="gif.title"
            @click="onGifClick(gif)"
          >
            <img
              :src="gif.previewUrl"
              :alt="gif.title"
              :width="gif.previewWidth"
              :height="gif.previewHeight"
              class="block h-auto w-full bg-ink-950 object-cover"
              loading="lazy"
            />
          </button>
        </div>
      </div>

      <div class="border-t border-white/[0.04] px-3 py-1.5 text-[10px] text-zinc-500">
        GIFs propulses par Tenor
      </div>
    </div>
  </div>
</template>

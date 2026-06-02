<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ExternalLink, Loader2, Rss, Settings2 } from 'lucide-vue-next'
import type { RssFeed } from '@shared/models'

interface RssConfig {
  url?: string
  label?: string
}

const props = defineProps<{
  config?: RssConfig
  editMode: boolean
}>()

const emit = defineEmits<{
  (event: 'update:config', value: RssConfig): void
}>()

const feed = ref<RssFeed | null>(null)
const status = ref<'idle' | 'loading' | 'error'>('idle')
const errorMessage = ref<string | undefined>()
const urlDraft = ref(props.config?.url ?? '')
const labelDraft = ref(props.config?.label ?? '')
const userOpenedEditor = ref(false)

const REFRESH_INTERVAL_MS = 5 * 60 * 1000
let refreshTimer: ReturnType<typeof setInterval> | undefined

const currentUrl = computed(() => props.config?.url ?? '')
const isEditing = computed(() => userOpenedEditor.value || !currentUrl.value)

const normalizeUrl = (raw: string): string | undefined => {
  const trimmed = raw.trim()
  if (!trimmed) {
    return undefined
  }
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined
    }
    return parsed.toString()
  } catch {
    return undefined
  }
}

const load = async (url: string): Promise<void> => {
  if (!window.omnidesk?.rss?.fetch) {
    return
  }
  status.value = 'loading'
  errorMessage.value = undefined
  try {
    feed.value = await window.omnidesk.rss.fetch(url, 10)
    status.value = 'idle'
  } catch (error) {
    status.value = 'error'
    errorMessage.value =
      error instanceof Error ? error.message : 'Impossible de lire le flux.'
  }
}

watch(
  currentUrl,
  (url) => {
    if (url) {
      void load(url)
    } else {
      feed.value = null
    }
  },
  { immediate: true },
)

onMounted(() => {
  refreshTimer = setInterval(() => {
    if (currentUrl.value) {
      void load(currentUrl.value)
    }
  }, REFRESH_INTERVAL_MS)
})

onBeforeUnmount(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
})

const submit = (): void => {
  const normalized = normalizeUrl(urlDraft.value)
  if (!normalized) {
    errorMessage.value = 'URL invalide. Utilisez http(s)://...'
    return
  }
  errorMessage.value = undefined
  emit('update:config', {
    url: normalized,
    label: labelDraft.value.trim() || undefined,
  })
  userOpenedEditor.value = false
}

const openEdit = (): void => {
  urlDraft.value = currentUrl.value
  labelDraft.value = props.config?.label ?? ''
  errorMessage.value = undefined
  userOpenedEditor.value = true
}

const formatDate = (value?: string): string => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.round(diffMs / 60_000)
  if (diffMinutes < 60) return diffMinutes < 1 ? "A l'instant" : `${diffMinutes} min`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} h`
  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 30) return `${diffDays} j`
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

const openItem = async (link?: string): Promise<void> => {
  if (link) {
    await window.omnidesk?.shell?.openExternal?.(link)
  }
}

const heading = computed(() => props.config?.label || feed.value?.title || 'Flux RSS')
</script>

<template>
  <div class="flex h-full flex-col p-5">
    <div class="mb-3 flex items-center justify-between gap-2">
      <span class="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        <Rss :size="13" class="shrink-0" />
        <span class="truncate normal-case tracking-normal text-zinc-300">{{ heading }}</span>
      </span>
      <div class="flex shrink-0 items-center gap-1">
        <a
          v-if="feed?.link && !isEditing"
          class="grid size-7 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
          :href="feed.link"
          rel="noopener noreferrer"
          target="_blank"
          title="Ouvrir le site"
        >
          <ExternalLink :size="13" />
        </a>
        <button
          class="grid size-7 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
          title="Configurer"
          type="button"
          @click="openEdit"
        >
          <Settings2 :size="13" />
        </button>
      </div>
    </div>

    <form
      v-if="isEditing"
      class="flex flex-1 flex-col justify-center gap-3"
      @submit.prevent="submit"
    >
      <div class="grid gap-1">
        <label class="text-xs text-zinc-400" for="rss-url">URL du flux</label>
        <input
          id="rss-url"
          v-model="urlDraft"
          autocomplete="off"
          class="rounded-lg bg-ink-950/70 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-white/5 focus:ring-accent-mint/40"
          placeholder="https://example.com/feed.xml"
          type="text"
        />
      </div>
      <div class="grid gap-1">
        <label class="text-xs text-zinc-400" for="rss-label">Titre (optionnel)</label>
        <input
          id="rss-label"
          v-model="labelDraft"
          autocomplete="off"
          class="rounded-lg bg-ink-950/70 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-white/5 focus:ring-accent-mint/40"
          placeholder="Actualites tech"
          type="text"
        />
      </div>
      <p v-if="errorMessage" class="text-xs text-accent-coral">{{ errorMessage }}</p>
      <button
        class="rounded-lg bg-accent-mint px-3 py-2 text-sm font-medium text-ink-950 disabled:opacity-50"
        :disabled="!urlDraft.trim()"
        type="submit"
      >
        Charger le flux
      </button>
    </form>

    <div v-else-if="status === 'loading' && !feed" class="flex flex-1 items-center justify-center text-zinc-500">
      <Loader2 :size="18" class="animate-spin" />
    </div>

    <div v-else-if="status === 'error'" class="flex flex-1 flex-col items-start justify-center gap-2 text-sm text-accent-coral">
      <p>{{ errorMessage }}</p>
      <button class="text-xs text-zinc-400 underline hover:text-zinc-100" type="button" @click="openEdit">
        Changer l'URL
      </button>
    </div>

    <div
      v-else-if="feed && feed.items.length === 0"
      class="flex flex-1 items-center justify-center text-sm text-zinc-500"
    >
      Aucun article dans ce flux.
    </div>

    <ul v-else-if="feed" class="scroll-thin grid min-h-0 flex-1 content-start gap-1.5 overflow-auto">
      <li
        v-for="(item, index) in feed.items"
        :key="`${item.link ?? item.title}-${index}`"
        class="rounded-xl bg-ink-950/55 p-3 transition hover:bg-white/[0.06]"
      >
        <button
          class="flex w-full flex-col gap-1 text-left"
          :disabled="!item.link"
          type="button"
          @click="openItem(item.link)"
        >
          <span class="flex items-baseline justify-between gap-3">
            <span class="line-clamp-2 text-sm font-medium text-zinc-100">{{ item.title }}</span>
            <span v-if="item.publishedAt" class="shrink-0 text-[11px] text-zinc-500">
              {{ formatDate(item.publishedAt) }}
            </span>
          </span>
          <span v-if="item.summary" class="line-clamp-2 text-xs leading-5 text-zinc-500">
            {{ item.summary }}
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>

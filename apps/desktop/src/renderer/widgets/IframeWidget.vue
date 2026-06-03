<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ExternalLink, Globe, Loader2, RotateCw, Settings2 } from 'lucide-vue-next'

interface IframeConfig {
  url?: string
  label?: string
}

interface WebviewElement extends HTMLElement {
  src: string
  reload: () => void
  getURL: () => string
}

const props = defineProps<{
  config?: IframeConfig
  editMode: boolean
}>()

const emit = defineEmits<{
  (event: 'update:config', value: IframeConfig): void
}>()

const webviewRef = ref<WebviewElement | null>(null)
const isLoading = ref(true)
const errorMessage = ref<string | undefined>()

const urlDraft = ref(props.config?.url ?? '')
const labelDraft = ref(props.config?.label ?? '')
const userOpenedEditor = ref(false)

const currentUrl = computed(() => props.config?.url ?? '')
const isEditing = computed(() => userOpenedEditor.value || !currentUrl.value)

const host = computed(() => {
  try {
    return new URL(currentUrl.value).host
  } catch {
    return currentUrl.value
  }
})

const partition = computed(() => 'persist:widget-iframe')

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

// Identite du webview deja equipe : le watch ci-dessous se redeclenche a chaque changement
// d'URL alors que l'element <webview> reste le meme (pas de :key), donc sans cette garde les
// ecouteurs s'empileraient (fuite EventEmitter "N did-stop-loading listeners"). Un element
// re-cree (nouvelle identite) est re-equipe normalement.
let listenersBoundTo: WebviewElement | null = null

const attachListeners = (): void => {
  const webview = webviewRef.value
  if (!webview || listenersBoundTo === webview) {
    return
  }
  listenersBoundTo = webview
  webview.addEventListener('did-start-loading', () => {
    isLoading.value = true
    errorMessage.value = undefined
  })
  webview.addEventListener('did-stop-loading', () => {
    isLoading.value = false
  })
  webview.addEventListener('did-fail-load', (event: Event) => {
    const details = event as Event & { errorDescription?: string; errorCode?: number }
    if (details.errorCode === -3) {
      return
    }
    isLoading.value = false
    errorMessage.value = details.errorDescription ?? 'Impossible de charger la page.'
  })
}

watch(
  currentUrl,
  async (url) => {
    if (!url) {
      return
    }
    isLoading.value = true
    errorMessage.value = undefined
    await nextTick()
    attachListeners()
  },
  { immediate: true },
)

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

const reload = (): void => {
  webviewRef.value?.reload()
}

const openExternal = async (): Promise<void> => {
  if (currentUrl.value) {
    await window.omnidesk?.shell?.openExternal?.(currentUrl.value)
  }
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <div class="flex shrink-0 items-center gap-2 border-b border-white/[0.04] px-4 py-2">
      <span class="flex min-w-0 flex-1 items-center gap-2">
        <Loader2 v-if="!isEditing && currentUrl && isLoading" :size="13" class="shrink-0 animate-spin text-accent-mint" />
        <Globe v-else :size="13" class="shrink-0 text-zinc-500" />
        <span class="min-w-0 truncate text-xs font-semibold text-zinc-200">
          {{ props.config?.label || host || 'Iframe' }}
        </span>
      </span>
      <button
        v-if="!isEditing && currentUrl"
        class="grid size-7 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
        title="Recharger"
        type="button"
        @click="reload"
      >
        <RotateCw :size="13" />
      </button>
      <button
        v-if="!isEditing && currentUrl"
        class="grid size-7 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
        title="Ouvrir dans le navigateur"
        type="button"
        @click="openExternal"
      >
        <ExternalLink :size="13" />
      </button>
      <button
        v-if="!isEditing"
        class="grid size-7 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
        title="Configurer"
        type="button"
        @click="openEdit"
      >
        <Settings2 :size="13" />
      </button>
    </div>

    <form
      v-if="isEditing"
      class="flex flex-1 flex-col justify-center gap-3 p-4"
      @submit.prevent="submit"
    >
      <div class="grid gap-1">
        <label class="text-xs text-zinc-400" for="iframe-url">URL</label>
        <input
          id="iframe-url"
          v-model="urlDraft"
          autocomplete="off"
          class="rounded-lg bg-ink-950/70 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-white/5 focus:ring-accent-mint/40"
          placeholder="https://example.com"
          type="text"
        />
      </div>
      <div class="grid gap-1">
        <label class="text-xs text-zinc-400" for="iframe-label">Titre (optionnel)</label>
        <input
          id="iframe-label"
          v-model="labelDraft"
          autocomplete="off"
          class="rounded-lg bg-ink-950/70 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-white/5 focus:ring-accent-mint/40"
          placeholder="Tableau de bord"
          type="text"
        />
      </div>
      <p v-if="errorMessage" class="text-xs text-accent-coral">{{ errorMessage }}</p>
      <button
        class="rounded-lg bg-accent-mint px-3 py-2 text-sm font-medium text-ink-950 disabled:opacity-50"
        :disabled="!urlDraft.trim()"
        type="submit"
      >
        Afficher la page
      </button>
    </form>

    <div v-else-if="!currentUrl" class="flex flex-1 items-center justify-center text-sm text-zinc-500">
      Cliquez sur l'engrenage pour ajouter une URL.
    </div>

    <div v-else-if="errorMessage" class="flex flex-1 flex-col items-start justify-center gap-2 p-4 text-sm text-accent-coral">
      <p>{{ errorMessage }}</p>
      <button class="text-xs text-zinc-400 underline hover:text-zinc-100" type="button" @click="openEdit">
        Changer l'URL
      </button>
    </div>

    <div v-else class="relative min-h-0 flex-1 bg-white">
      <webview
        ref="webviewRef"
        :src="currentUrl"
        :partition="partition"
        allowpopups
        class="h-full w-full"
      />
    </div>
  </div>
</template>

<style scoped>
webview {
  display: inline-flex;
  width: 100%;
  height: 100%;
}
</style>

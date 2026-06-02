<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Loader2,
  Pin,
  PinOff,
  RotateCw,
  Shield,
  ShieldOff,
} from 'lucide-vue-next'
import Spinner from '@renderer/components/ui/Spinner.vue'
import { webpageController, type WebpageWebviewElement } from '@renderer/services/webpageController'
import { useAppStore } from '@renderer/stores/appStore'
import type { AccountSummary } from '@shared/models'

const props = defineProps<{ account: AccountSummary }>()

const store = useAppStore()

// Actif par defaut : seul un keepAlive explicitement a false desactive le maintien en
// arriere-plan (necessaire pour les notifications et le compteur de non-lus).
const keepAlive = computed(() => props.account.settings?.keepAlive !== false)
const adBlock = computed(() => props.account.settings?.adBlock === true)

// Compteur de non-lus deduit du titre de l'onglet (ex. "(3) Slack", "(12) | Microsoft
// Teams"). Heuristique volontairement simple : premier nombre entre parentheses.
const parseUnreadFromTitle = (title: string): number => {
  const raw = title.match(/\((\d+)\+?\)/)?.[1]
  if (!raw) {
    return 0
  }
  const count = Number.parseInt(raw, 10)
  return Number.isFinite(count) ? count : 0
}

const toggleKeepAlive = (): void => {
  void store.setWebpageKeepAlive(props.account.id, !keepAlive.value)
}

const toggleAdBlock = (): void => {
  const next = !adBlock.value
  void store.setWebpageAdBlock(props.account.id, next).then(() => {
    // Le filtre webRequest agit sur les requetes a venir, on recharge pour
    // que la page repasse par le filtre (sinon les pubs deja chargees restent).
    webviewRef.value?.reload()
  })
}

const webviewRef = ref<WebpageWebviewElement | null>(null)
const isLoading = ref(true)
const currentUrl = ref<string>('')
const canGoBack = ref(false)
const canGoForward = ref(false)

const settings = computed(() => props.account.settings as { url?: string; host?: string } | undefined)

const initialUrl = computed(() => {
  const stored = settings.value?.url
  if (typeof stored === 'string' && stored.length > 0) {
    return stored
  }
  return 'about:blank'
})

const initialHost = computed(() => {
  try {
    return new URL(initialUrl.value).host
  } catch {
    return ''
  }
})

const partition = computed(() => `persist:webpage-${props.account.id}`)

const refreshNavState = (): void => {
  const webview = webviewRef.value
  if (!webview) {
    return
  }
  try {
    canGoBack.value = webview.canGoBack()
    canGoForward.value = webview.canGoForward()
    currentUrl.value = webview.getURL()
  } catch {
    canGoBack.value = false
    canGoForward.value = false
  }
}

let mediaPollTimer: number | undefined
let stopMediaPoll = false

const stopMediaPolling = (): void => {
  stopMediaPoll = true
  if (mediaPollTimer !== undefined) {
    window.clearTimeout(mediaPollTimer)
    mediaPollTimer = undefined
  }
}

const pollMediaSnapshot = async (): Promise<void> => {
  if (stopMediaPoll) {
    return
  }
  const snapshot = await webpageController.readMediaSnapshot(props.account.id)
  if (snapshot && !stopMediaPoll) {
    store.setWebpageMediaState(props.account.id, {
      ...(snapshot.paused !== null ? { paused: snapshot.paused } : {}),
      ...(snapshot.volume !== null ? { volume: snapshot.volume } : {}),
      title: snapshot.title,
      artist: snapshot.artist,
      album: snapshot.album,
      artworkUrl: snapshot.artworkUrl,
    })
  }
  // Meme boucle : on draine les notifications web captees par le pont injecte (cf.
  // webpageController) et on les enregistre dans le centre de notifications.
  if (!stopMediaPoll) {
    const captured = await webpageController.drainNotifications(props.account.id)
    for (const item of captured) {
      void store.recordWebpageNotification(props.account.id, item)
    }
  }
  if (!stopMediaPoll) {
    mediaPollTimer = window.setTimeout(() => {
      void pollMediaSnapshot()
    }, 2000)
  }
}

const attachWebviewListeners = (): void => {
  const webview = webviewRef.value
  if (!webview) {
    return
  }

  webview.addEventListener('did-start-loading', () => {
    isLoading.value = true
  })
  webview.addEventListener('did-stop-loading', () => {
    isLoading.value = false
    refreshNavState()
    void webpageController.installMediaSessionWrapper(props.account.id)
    void webpageController.installNotificationBridge(props.account.id)
    store.setWebpageUnread(props.account.id, parseUnreadFromTitle(webview.getTitle()))
    void (async () => {
      const favicon = await webpageController.readFavicon(props.account.id)
      if (favicon) {
        void store.setWebpageFavicon(props.account.id, favicon)
      }
    })()
  })
  webview.addEventListener('page-title-updated', ((event: Event) => {
    const detail = event as unknown as { title?: string }
    store.setWebpageUnread(props.account.id, parseUnreadFromTitle(detail.title ?? ''))
  }) as EventListener)
  webview.addEventListener('did-navigate', () => {
    refreshNavState()
  })
  webview.addEventListener('did-navigate-in-page', () => {
    refreshNavState()
  })
  webview.addEventListener('page-favicon-updated', ((event: Event) => {
    const detail = event as unknown as { favicons?: string[] }
    const next = detail.favicons?.[0] ?? null
    if (next) {
      void store.setWebpageFavicon(props.account.id, next)
    }
  }) as EventListener)
  webview.addEventListener('media-started-playing', () => {
    store.setWebpageMediaState(props.account.id, {
      audible: true,
      paused: false,
      muted: webview.isAudioMuted(),
    })
    void pollMediaSnapshot()
  })
  webview.addEventListener('media-paused', () => {
    store.setWebpageMediaState(props.account.id, {
      audible: webview.isCurrentlyAudible(),
      paused: true,
    })
  })
}

watch(
  () => props.account.id,
  async (newId, oldId) => {
    if (oldId) {
      webpageController.unregister(oldId)
      stopMediaPolling()
    }
    isLoading.value = true
    canGoBack.value = false
    canGoForward.value = false
    currentUrl.value = initialUrl.value
    await nextTick()
    const webview = webviewRef.value
    if (webview) {
      webpageController.register(newId, webview)
      store.ensureWebpageMediaSlot(newId)
    }
    attachWebviewListeners()
    stopMediaPoll = false
    mediaPollTimer = window.setTimeout(() => {
      void pollMediaSnapshot()
    }, 2000)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  stopMediaPolling()
  webpageController.unregister(props.account.id)
  store.clearWebpageMedia(props.account.id)
})

const handleReload = (): void => {
  webviewRef.value?.reload()
}

const handleBack = (): void => {
  if (canGoBack.value) {
    webviewRef.value?.goBack()
  }
}

const handleForward = (): void => {
  if (canGoForward.value) {
    webviewRef.value?.goForward()
  }
}

const handleOpenExternal = async (): Promise<void> => {
  const target = currentUrl.value || initialUrl.value
  await window.omnidesk?.shell?.openExternal?.(target)
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/[0.04] bg-ink-925/92 shadow-lift">
    <header class="flex items-center gap-2 border-b border-white/[0.04] px-3 py-2">
      <button
        type="button"
        class="app-no-drag grid size-9 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
        :disabled="!canGoBack"
        title="Precedent"
        @click="handleBack"
      >
        <ArrowLeft :size="16" />
      </button>
      <button
        type="button"
        class="app-no-drag grid size-9 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
        :disabled="!canGoForward"
        title="Suivant"
        @click="handleForward"
      >
        <ArrowRight :size="16" />
      </button>
      <button
        type="button"
        class="app-no-drag grid size-9 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
        title="Recharger"
        @click="handleReload"
      >
        <RotateCw :size="16" />
      </button>

      <div class="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-1.5">
        <Loader2 v-if="isLoading" :size="14" class="shrink-0 animate-spin text-accent-mint" />
        <div v-else class="size-2 shrink-0 rounded-full bg-accent-mint" />
        <div class="flex min-w-0 flex-col">
          <span class="truncate text-xs font-semibold text-zinc-200">
            {{ account.label }}
          </span>
          <span class="truncate text-[11px] text-zinc-500">
            {{ currentUrl || initialHost }}
          </span>
        </div>
      </div>

      <button
        type="button"
        class="app-no-drag grid size-9 place-items-center rounded-lg transition hover:bg-white/[0.06]"
        :class="adBlock ? 'text-accent-mint' : 'text-zinc-400 hover:text-zinc-100'"
        :title="
          adBlock
            ? 'Blocage des pubs actif (cliquer pour desactiver)'
            : 'Bloquer les pubs et trackers'
        "
        @click="toggleAdBlock"
      >
        <component :is="adBlock ? Shield : ShieldOff" :size="16" />
      </button>


      <button
        type="button"
        class="app-no-drag grid size-9 place-items-center rounded-lg transition hover:bg-white/[0.06]"
        :class="keepAlive ? 'text-accent-mint' : 'text-zinc-400 hover:text-zinc-100'"
        :title="
          keepAlive
            ? 'Garde la page active en arriere-plan (cliquer pour desactiver)'
            : 'Garder la page active en arriere-plan'
        "
        @click="toggleKeepAlive"
      >
        <component :is="keepAlive ? Pin : PinOff" :size="16" />
      </button>

      <button
        type="button"
        class="app-no-drag grid size-9 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
        title="Ouvrir dans le navigateur"
        @click="handleOpenExternal"
      >
        <ExternalLink :size="16" />
      </button>
    </header>

    <div class="relative flex-1 min-h-0 bg-ink-950">
      <webview
        ref="webviewRef"
        :src="initialUrl"
        :partition="partition"
        allowpopups
        class="h-full w-full"
      />
      <Transition
        enter-active-class="transition-opacity duration-150"
        leave-active-class="transition-opacity duration-300"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
      >
        <div
          v-if="isLoading"
          class="pointer-events-none absolute inset-0 grid place-items-center bg-ink-950"
        >
          <div class="flex flex-col items-center gap-3 text-zinc-300">
            <Spinner :size="28" :label="`Chargement de ${initialHost || account.label}`" />
            <p class="text-xs uppercase tracking-[0.18em] text-zinc-500">
              Chargement...
            </p>
          </div>
        </div>
      </Transition>
    </div>
  </section>
</template>

<style scoped>
webview {
  display: inline-flex;
  width: 100%;
  height: 100%;
}
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import { browserTabController } from '@renderer/services/browserTabController'
import type { WebpageWebviewElement } from '@renderer/services/webpageController'
import { useBrowserStore, type BrowserTabView } from '@renderer/stores/browserStore'

const props = defineProps<{ tab: BrowserTabView; active: boolean }>()

const store = useBrowserStore()

const webviewRef = ref<WebpageWebviewElement | null>(null)
// Onglet prive : partition en memoire partagee (non persistee) ; sinon partition de l'espace.
const partition = computed(() =>
  props.tab.isPrivate ? 'omnibrowser-private' : `persist:omnibrowser-${props.tab.spaceId}`,
)
const hasWebview = computed(() => props.tab.initialUrl.length > 0)

const quickLinks = computed(() => store.bookmarks.slice(0, 12))

const refreshNavState = (): void => {
  const webview = webviewRef.value
  if (!webview) {
    return
  }
  try {
    store.setTabNavState(props.tab.id, {
      canGoBack: webview.canGoBack(),
      canGoForward: webview.canGoForward(),
      url: webview.getURL(),
    })
  } catch {
    // Webview detache : on ignore.
  }
}

// Identite du webview deja equipe (plutot qu'un simple booleen) : on n'empile pas les ecouteurs
// si l'element est inchange, mais un element re-cree est bien re-equipe a son tour.
let listenersBoundTo: WebpageWebviewElement | null = null

const attachListeners = (webview: WebpageWebviewElement): void => {
  if (listenersBoundTo === webview) {
    return
  }
  listenersBoundTo = webview

  webview.addEventListener('did-start-loading', () => {
    store.setTabNavState(props.tab.id, { isLoading: true })
  })
  webview.addEventListener('did-stop-loading', () => {
    store.setTabNavState(props.tab.id, { isLoading: false })
    refreshNavState()
    store.recordHistoryForTab(props.tab.id)
    // Connexion sans changement de page (SPA) : on draine l'identifiant eventuellement saisi.
    void store.captureCredentials(props.tab.id)
  })
  // Connexion avec navigation pleine page : on draine avant que l'ancien document parte.
  webview.addEventListener('will-navigate', () => {
    void store.captureCredentials(props.tab.id)
  })
  webview.addEventListener('did-navigate', () => {
    refreshNavState()
    store.recordHistoryForTab(props.tab.id)
    void store.persistTab(props.tab)
  })
  webview.addEventListener('did-navigate-in-page', () => {
    refreshNavState()
  })
  webview.addEventListener('page-title-updated', ((event: Event) => {
    const detail = event as unknown as { title?: string }
    if (detail.title) {
      store.setTabNavState(props.tab.id, { title: detail.title })
      store.recordHistoryForTab(props.tab.id)
    }
  }) as EventListener)
  webview.addEventListener('page-favicon-updated', ((event: Event) => {
    const detail = event as unknown as { favicons?: string[] }
    const next = detail.favicons?.[0]
    if (next) {
      store.setTabNavState(props.tab.id, { faviconUrl: next })
      void store.persistTab(props.tab)
    }
  }) as EventListener)
  webview.addEventListener('media-started-playing', () => {
    store.setTabNavState(props.tab.id, { audible: true, muted: webview.isAudioMuted() })
  })
  webview.addEventListener('media-paused', () => {
    store.setTabNavState(props.tab.id, { audible: webview.isCurrentlyAudible() })
  })
  webview.addEventListener('dom-ready', () => {
    browserTabController.syncWebContents(props.tab.id)
    refreshNavState()
    // Gestionnaire de mots de passe : pont de capture + autofill (hors navigation privee).
    if (!props.tab.isPrivate) {
      void browserTabController.installPasswordBridge(props.tab.id)
      void store.autofillCredentials(props.tab.id)
    }
  })
  webview.addEventListener('render-process-gone', () => {
    store.setTabNavState(props.tab.id, { crashed: true, isLoading: false })
  })
  webview.addEventListener('did-fail-load', ((event: Event) => {
    const detail = event as unknown as { errorCode?: number; isMainFrame?: boolean }
    // -3 = ABORTED (navigation rapide), ignore. Seules les erreurs du frame principal comptent.
    if (detail.isMainFrame && detail.errorCode !== undefined && detail.errorCode !== -3) {
      store.setTabNavState(props.tab.id, { isLoading: false })
    }
  }) as EventListener)
}

watch(
  webviewRef,
  (webview) => {
    if (webview) {
      browserTabController.register(props.tab.id, webview)
      attachListeners(webview)
    }
  },
  { immediate: true },
)

const openQuickLink = (url: string): void => {
  void store.navigateTab(props.tab, url)
}

// Sonde periodique : draine l'identifiant eventuellement saisi meme sans navigation (connexion
// SPA/XHR, ou la soumission ne provoque ni rechargement ni changement d'URL). Limitee a l'onglet
// actif et non prive pour rester legere ; les drains sur evenements (did-stop-loading,
// will-navigate) restent le filet pour les connexions avec navigation pleine page.
let credentialPollTimer: number | undefined
let stopCredentialPoll = false

const pollCredentialCapture = async (): Promise<void> => {
  if (stopCredentialPoll) {
    return
  }
  if (props.active && !props.tab.isPrivate && hasWebview.value) {
    await store.captureCredentials(props.tab.id)
  }
  if (!stopCredentialPoll) {
    credentialPollTimer = window.setTimeout(() => void pollCredentialCapture(), 1500)
  }
}

onMounted(() => {
  void pollCredentialCapture()
})

onBeforeUnmount(() => {
  stopCredentialPoll = true
  if (credentialPollTimer !== undefined) {
    window.clearTimeout(credentialPollTimer)
  }
})
</script>

<template>
  <div class="absolute inset-0 flex min-h-0 flex-col bg-ink-950">
    <webview
      v-if="hasWebview"
      ref="webviewRef"
      :src="tab.initialUrl"
      :partition="partition"
      allowpopups
      class="h-full w-full"
    />

    <div v-else class="flex h-full w-full flex-col items-center justify-center gap-8 overflow-auto p-10">
      <div v-if="tab.isPrivate" class="max-w-md text-center">
        <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-400">Navigation privée</p>
        <h2 class="mt-2 text-2xl font-semibold text-white">Vous naviguez en privé</h2>
        <p class="mt-1 text-sm text-zinc-500">
          Cette session est éphémère : aucun cookie, aucune donnée de site ni historique ne sont
          conservés sur cet appareil. Vos onglets normaux restent isolés.
        </p>
      </div>
      <div v-else class="text-center">
        <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-mint">OmniBrowser</p>
        <h2 class="mt-2 text-2xl font-semibold text-white">Nouvel onglet</h2>
        <p class="mt-1 text-sm text-zinc-500">Saisissez une adresse ou recherchez depuis la barre ci-dessus.</p>
      </div>

      <div v-if="!tab.isPrivate && quickLinks.length > 0" class="w-full max-w-2xl">
        <p class="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Favoris</p>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          <button
            v-for="bookmark in quickLinks"
            :key="bookmark.id"
            type="button"
            class="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-3 py-2.5 text-left transition hover:bg-white/[0.08]"
            @click="openQuickLink(bookmark.url)"
          >
            <img
              v-if="bookmark.faviconUrl"
              :src="bookmark.faviconUrl"
              alt=""
              referrerpolicy="no-referrer"
              class="size-5 shrink-0 rounded-sm object-contain"
            />
            <span v-else class="grid size-5 shrink-0 place-items-center rounded-sm bg-white/[0.08] text-[10px] text-zinc-300">
              {{ bookmark.title.slice(0, 1).toUpperCase() }}
            </span>
            <span class="min-w-0 truncate text-sm text-zinc-200">{{ bookmark.title }}</span>
          </button>
        </div>
      </div>
    </div>

    <Transition
      enter-active-class="transition-opacity duration-150"
      leave-active-class="transition-opacity duration-300"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="hasWebview && tab.isLoading"
        class="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-2"
      >
        <Loader2 :size="16" class="animate-spin text-accent-mint" />
      </div>
    </Transition>

    <div
      v-if="tab.crashed"
      class="absolute inset-0 grid place-items-center bg-ink-950/95"
    >
      <div class="flex flex-col items-center gap-3 text-center">
        <p class="text-sm text-zinc-300">Cet onglet a planté.</p>
        <button
          type="button"
          class="rounded-lg bg-white/[0.08] px-4 py-2 text-sm text-zinc-100 transition hover:bg-white/[0.12]"
          @click="store.reloadActiveTab()"
        >
          Recharger
        </button>
      </div>
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

<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { CheckCircle2, X } from 'lucide-vue-next'
import AccountRail from '@renderer/components/AccountRail.vue'
import ConversationsRail from '@renderer/components/ConversationsRail.vue'
import OmnichatRail from '@renderer/components/OmnichatRail.vue'
import OmnipassRail from '@renderer/components/OmnipassRail.vue'
import HomeView from '@renderer/components/HomeView.vue'
import CustomHomeView from '@renderer/components/CustomHomeView.vue'
import ConversationPanel from '@renderer/components/ConversationPanel.vue'
import NotificationsView from '@renderer/components/NotificationsView.vue'
import OmniBrowserView from '@renderer/components/browser/OmniBrowserView.vue'
import OmnichatView from '@renderer/components/OmnichatView.vue'
import OmnipassView from '@renderer/components/OmnipassView.vue'
import TopBar from '@renderer/components/TopBar.vue'
import WebpageView from '@renderer/components/WebpageView.vue'
import WindowChrome from '@renderer/components/WindowChrome.vue'
import AddAccountDialog from '@renderer/components/AddAccountDialog.vue'
import CallOverlay from '@renderer/components/CallOverlay.vue'
import IncomingCallDialog from '@renderer/components/IncomingCallDialog.vue'
import ComposeMailDialog from '@renderer/components/ComposeMailDialog.vue'
import ImapInboxView from '@renderer/components/ImapInboxView.vue'
import MediaPlayer from '@renderer/components/MediaPlayer.vue'
import SettingsView from '@renderer/components/SettingsView.vue'
import OmniHowlMascot from '@renderer/components/mascot/OmniHowlMascot.vue'
import ConfirmDialog from '@renderer/components/ui/ConfirmDialog.vue'
import Spinner from '@renderer/components/ui/Spinner.vue'
import { useAppStore } from '@renderer/stores/appStore'
import { useOmnichatStore } from '@renderer/stores/omnichatStore'
import { applyAccentColor, cacheAccentColor } from '@renderer/utils/accentColor'
import { applyBaseColor, cacheBaseColor } from '@renderer/utils/baseColor'

const store = useAppStore()
const omnichat = useOmnichatStore()
const isMac = computed(() => navigator.platform.toUpperCase().includes('MAC'))

let toastTimer: ReturnType<typeof setTimeout> | undefined

const dismissToast = (): void => {
  if (toastTimer) {
    clearTimeout(toastTimer)
    toastTimer = undefined
  }
  store.actionFeedback = undefined
}

watch(
  () => store.actionFeedback,
  (value) => {
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = undefined
    }
    if (!value) {
      return
    }
    toastTimer = setTimeout(() => {
      if (store.actionFeedback === value) {
        store.actionFeedback = undefined
      }
      toastTimer = undefined
    }, 4000)
  },
)

onUnmounted(() => {
  if (toastTimer) {
    clearTimeout(toastTimer)
  }
})

// Pastille du dock (macOS) : reflet du total de non-lus tous comptes confondus.
// Se met a jour des qu'un compte change de compteur (nouveau message Teams, mail, etc.).
watch(
  () => store.totalUnreadCount,
  (count) => {
    void window.omnidesk?.app.setBadgeCount(count)
  },
  { immediate: true },
)
const isWebpageAccountActive = computed(
  () => store.activeView === 'inbox' && store.activeAccount?.providerId === 'webpage',
)
const isImapAccountActive = computed(
  () => store.activeView === 'inbox' && store.activeAccount?.providerId === 'imap',
)
const showImapInbox = computed(
  () => isImapAccountActive.value && !store.selectedConversation,
)
const showConversationsRail = computed(
  () => store.activeView === 'inbox' && !isWebpageAccountActive.value,
)
const showOmnichatRail = computed(() => store.activeView === 'omnichat')
const showOmnipassRail = computed(() => store.activeView === 'omnipass')
// Vue omnichat avec une conversation native ouverte : on affiche le panel de
// conversation a la place du hub d'appels.
const showOmnichatConversation = computed(
  () => store.activeView === 'omnichat' && store.selectedConversation?.providerId === 'omnichat',
)
const gridTemplate = computed(() =>
  showConversationsRail.value || showOmnichatRail.value || showOmnipassRail.value
    ? '72px 280px minmax(0,1fr)'
    : '72px minmax(0,1fr)',
)

// Pages web maintenues montees dans le DOM (masquees via v-show quand elles ne
// sont pas au premier plan) :
//   - la page web actuellement ouverte ;
//   - les pages connectees non desactivees (keepAlive !== false, actif par defaut) :
//     elles tournent en arriere-plan pour recevoir notifications et non-lus ;
//   - les pages qui jouent du son.
// Garder une page sonore montee permet a la musique de continuer et au mini-lecteur
// de rester visible quand on change d'app. La page active est rendue par cette meme
// liste pour qu'elle ne soit jamais re-montee (ce qui rechargerait la page) quand
// elle se met a jouer du son ou qu'on la quitte.
const mountedWebpageAccounts = computed(() =>
  store.accounts.filter((account) => {
    if (account.providerId !== 'webpage') {
      return false
    }
    if (isWebpageAccountActive.value && store.activeAccount?.id === account.id) {
      return true
    }
    if (account.setupStatus !== 'connected') {
      return false
    }
    // Actif par defaut (keepAlive !== false) : les pages web connectees restent montees en
    // arriere-plan pour recevoir notifications et compteur de non-lus, sauf desactivation
    // explicite via l'icone epingle.
    return (
      account.settings?.keepAlive !== false || store.webpageMedia[account.id]?.audible === true
    )
  }),
)
const activeWebpageId = computed(() =>
  isWebpageAccountActive.value ? store.activeAccount?.id : undefined,
)

// Pont reactif Pinia -> DOM : toute couleur d'accent validee (defaut, base ou choix
// utilisateur) est appliquee a la variable CSS et mise en cache pour le prochain lancement.
watch(
  () => store.accentColor,
  (color) => {
    applyAccentColor(color)
    cacheAccentColor(color)
  },
  { immediate: true },
)

// Idem pour la couleur de fond : applique le degrade ink derive + cache anti-flash.
watch(
  () => store.baseColor,
  (color) => {
    applyBaseColor(color)
    cacheBaseColor(color)
  },
  { immediate: true },
)

onMounted(() => {
  void store.bootstrapApp()
  void omnichat.init()
})
</script>

<template>
  <main class="relative flex h-full min-h-0 flex-col overflow-hidden bg-ink-950 text-white">
    <WindowChrome v-if="!isMac" />
    <TopBar :is-mac="isMac" />
    <AddAccountDialog />
    <ComposeMailDialog />
    <ConfirmDialog />
    <CallOverlay />
    <IncomingCallDialog />

    <div
      class="grid min-h-0 flex-1 gap-0 p-1.5 pt-1"
      :style="{ gridTemplateColumns: gridTemplate }"
    >
      <AccountRail />

      <ConversationsRail v-if="showConversationsRail" />

      <OmnichatRail v-else-if="showOmnichatRail" />

      <OmnipassRail v-else-if="showOmnipassRail" />

      <section class="relative flex min-w-0 min-h-0 flex-col overflow-hidden">
        <WebpageView
          v-for="account in mountedWebpageAccounts"
          v-show="activeWebpageId === account.id"
          :key="account.id"
          :account="account"
          class="absolute inset-0"
        />

        <template v-if="!isWebpageAccountActive">
          <HomeView v-if="store.activeView === 'home'" />
          <CustomHomeView v-else-if="store.activeView === 'custom-home'" />
          <ImapInboxView v-else-if="showImapInbox" />
          <ConversationPanel v-else-if="store.activeView === 'inbox' || showOmnichatConversation" />
          <NotificationsView v-else-if="store.activeView === 'notifications'" />
          <OmniBrowserView v-else-if="store.activeView === 'browser'" />
          <OmnichatView v-else-if="store.activeView === 'omnichat'" />
          <OmnipassView v-else-if="store.activeView === 'omnipass'" />
          <SettingsView v-else />
        </template>
      </section>
    </div>

    <MediaPlayer />

    <div
      v-if="store.isLoading"
      class="absolute inset-0 z-50 grid place-items-center bg-ink-950/70 backdrop-blur-sm"
    >
      <div class="flex flex-col items-center gap-3 text-zinc-300">
        <Spinner :size="28" label="Demarrage d'Omnidesk" />
        <p class="text-xs uppercase tracking-[0.18em] text-zinc-500">Demarrage...</p>
      </div>
    </div>

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-2 opacity-0"
    >
      <div
        v-if="store.actionFeedback"
        class="pointer-events-none absolute inset-x-0 bottom-6 z-50 flex justify-center"
        role="status"
        aria-live="polite"
      >
        <div
          class="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border border-white/[0.06] bg-ink-900/95 px-4 py-2.5 text-sm text-zinc-100 shadow-lift backdrop-blur"
        >
          <CheckCircle2 :size="16" class="shrink-0 text-accent-mint" />
          <span class="min-w-0 flex-1">{{ store.actionFeedback }}</span>
          <button
            class="grid size-6 place-items-center rounded-md text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
            type="button"
            aria-label="Fermer"
            @click="dismissToast"
          >
            <X :size="13" />
          </button>
        </div>
      </div>
    </Transition>

    <OmniHowlMascot />
  </main>
</template>

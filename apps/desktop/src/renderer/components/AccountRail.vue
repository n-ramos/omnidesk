<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Compass, House, KeyRound, Plus, Settings, Unplug, Video, Volume2, VolumeX } from 'lucide-vue-next'
import ProviderLogo from '@renderer/components/ui/ProviderLogo.vue'
import { confirm } from '@renderer/composables/useConfirm'
import { useOmnichat } from '@renderer/composables/useOmnichat'
import { webpageController } from '@renderer/services/webpageController'
import { useAppStore } from '@renderer/stores/appStore'
import type { WebpageMediaState } from '@renderer/stores/appStore'
import type { AccountSummary } from '@shared/models'

const store = useAppStore()
const omnichat = useOmnichat()

// Tuiles du rail = slots cibles par les raccourcis Cmd/Ctrl+1..9 (getter partage avec
// l'appStore). Le compte "self" omnichat, ancrage interne, en est deja exclu.
const accounts = computed(() => store.slotAccounts)
const unreadByAccount = computed(() => store.unreadByAccount)

// Drag & drop pour reordonner les comptes dans le rail.
// On garde une copie locale reordonnable pendant le glissement (retour visuel immediat),
// resynchronisee sur le store des qu'on ne glisse plus.
const DND_MIME = 'application/x-omnidesk-account'
const localAccounts = ref<AccountSummary[]>([])
const draggingId = ref<string | null>(null)

watch(
  accounts,
  (next) => {
    if (draggingId.value) {
      return
    }
    localAccounts.value = [...next]
  },
  { immediate: true },
)

const onAccountDragStart = (accountId: string, event: DragEvent): void => {
  draggingId.value = accountId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(DND_MIME, accountId)
  }
}

const onAccountDragOver = (overId: string, event: DragEvent): void => {
  if (!draggingId.value || draggingId.value === overId) {
    return
  }
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  const ids = localAccounts.value.map((account) => account.id)
  const fromIndex = ids.indexOf(draggingId.value)
  const toIndex = ids.indexOf(overId)
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return
  }
  const [moved] = ids.splice(fromIndex, 1)
  if (moved === undefined) {
    return
  }
  ids.splice(toIndex, 0, moved)
  const byId = new Map(localAccounts.value.map((account) => [account.id, account]))
  localAccounts.value = ids
    .map((id) => byId.get(id))
    .filter((account): account is AccountSummary => account !== undefined)
}

const finishAccountDrag = (): void => {
  if (!draggingId.value) {
    return
  }
  const orderedIds = localAccounts.value.map((account) => account.id)
  draggingId.value = null
  void store.reorderAccounts(orderedIds)
}

type ContextMenuState = {
  accountId: string
  label: string
  x: number
  y: number
}

const contextMenu = ref<ContextMenuState | null>(null)

const openContextMenu = (
  account: { id: string; label: string },
  event: MouseEvent,
): void => {
  event.preventDefault()
  contextMenu.value = {
    accountId: account.id,
    label: account.label,
    x: event.clientX,
    y: event.clientY,
  }
}

const closeContextMenu = (): void => {
  contextMenu.value = null
}

const handleDisconnect = async (): Promise<void> => {
  const current = contextMenu.value
  if (!current) {
    return
  }
  closeContextMenu()
  const ok = await confirm({
    title: `Deconnecter ${current.label} ?`,
    message: 'Les conversations locales associees seront supprimees.',
    confirmLabel: 'Deconnecter',
    tone: 'danger',
  })
  if (ok) {
    void store.disconnectAccount(current.accountId)
  }
}

const onDocumentMousedown = (event: MouseEvent): void => {
  if (!contextMenu.value) {
    return
  }
  const target = event.target as HTMLElement | null
  if (target && target.closest('[data-account-context-menu]')) {
    return
  }
  closeContextMenu()
}

const onKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape' && contextMenu.value) {
    closeContextMenu()
  }
}

document.addEventListener('mousedown', onDocumentMousedown)
document.addEventListener('keydown', onKeydown)

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentMousedown)
  document.removeEventListener('keydown', onKeydown)
})

const mediaStateFor = (accountId: string): WebpageMediaState | undefined =>
  store.webpageMedia[accountId]

const isAudible = (accountId: string): boolean =>
  mediaStateFor(accountId)?.audible === true

const faviconFor = (account: { settings?: Record<string, unknown> }): string | undefined => {
  const value = account.settings?.faviconUrl
  return typeof value === 'string' ? value : undefined
}

const handleToggleMute = (accountId: string, event: MouseEvent): void => {
  event.stopPropagation()
  const current = mediaStateFor(accountId)
  if (!current) {
    return
  }
  const next = !current.muted
  webpageController.toggleMute(accountId, next)
  store.setWebpageMediaState(accountId, { muted: next })
}

const initialFor = (label: string): string => {
  const cleaned = label.replace(/^(slack|teams)\s+/i, '').trim()
  return cleaned.slice(0, 1).toUpperCase() || '?'
}

const handleHomeClick = (): void => {
  store.setView('home')
}

const handleAccountClick = (accountId: string): void => {
  void store.selectAccount(accountId)
}

const isAccountActive = (accountId: string): boolean =>
  store.activeView === 'inbox' && store.activeAccountId === accountId

const formatBadge = (count: number): string => (count > 99 ? '99+' : String(count))
</script>

<template>
  <aside
    class="relative z-20 flex min-h-0 flex-col items-center rounded-l-xl border border-white/[0.04] bg-ink-925/92 py-4 shadow-lift"
  >
    <button
      class="app-no-drag mb-3 grid size-10 place-items-center rounded-xl bg-accent-mint text-ink-950 transition hover:brightness-110"
      :class="
        store.shouldShowHome
          ? 'shadow-[inset_0_0_0_2px_rgba(45,184,128,0.95),0_0_14px_-4px_rgba(45,184,128,0.45)]'
          : 'shadow-lift'
      "
      :title="store.shouldShowHome ? 'Accueil' : 'Retour a l\'accueil'"
      type="button"
      @click="handleHomeClick"
    >
      <House :size="18" />
    </button>

    <button
      class="app-no-drag grid size-10 place-items-center rounded-xl transition"
      :class="
        store.activeView === 'browser'
          ? 'bg-white/[0.12] text-accent-mint shadow-[inset_0_0_0_2px_rgba(45,184,128,0.95),0_0_14px_-4px_rgba(45,184,128,0.45)]'
          : 'text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-100'
      "
      title="OmniBrowser"
      type="button"
      @click="store.setView('browser')"
    >
      <Compass :size="18" />
    </button>

    <button
      class="app-no-drag relative grid size-10 place-items-center rounded-xl transition"
      :class="
        store.activeView === 'omnichat'
          ? 'bg-white/[0.12] text-accent-mint shadow-[inset_0_0_0_2px_rgba(45,184,128,0.95),0_0_14px_-4px_rgba(45,184,128,0.45)]'
          : 'text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-100'
      "
      :title="omnichat.state.active ? 'Omnichat - appel en cours' : 'Omnichat'"
      type="button"
      @click="store.setView('omnichat')"
    >
      <Video :size="18" />
      <span
        v-if="omnichat.state.active"
        class="absolute -right-0.5 -top-0.5 size-2.5 animate-pulse rounded-full bg-accent-mint ring-2 ring-ink-925"
      />
    </button>

    <button
      class="app-no-drag grid size-10 place-items-center rounded-xl transition"
      :class="
        store.activeView === 'omnipass'
          ? 'bg-white/[0.12] text-accent-mint shadow-[inset_0_0_0_2px_rgba(45,184,128,0.95),0_0_14px_-4px_rgba(45,184,128,0.45)]'
          : 'text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-100'
      "
      title="Omnipass"
      type="button"
      @click="store.setView('omnipass')"
    >
      <KeyRound :size="18" />
    </button>

    <div class="my-2 h-px w-8 bg-white/[0.08]" />

    <nav class="scroll-thin flex min-h-0 flex-1 w-full flex-col items-center gap-2.5 overflow-y-auto px-3 pt-2">
      <div
        v-for="account in localAccounts"
        :key="account.id"
        class="relative cursor-grab transition-opacity active:cursor-grabbing"
        :class="draggingId === account.id ? 'opacity-40' : ''"
        draggable="true"
        @dragstart="onAccountDragStart(account.id, $event)"
        @dragover.prevent="onAccountDragOver(account.id, $event)"
        @drop.prevent="finishAccountDrag"
        @dragend="finishAccountDrag"
      >
        <button
          class="app-no-drag relative grid size-11 place-items-center rounded-xl text-zinc-100 transition duration-200"
          :class="[
            isAccountActive(account.id)
              ? 'bg-white/[0.12] shadow-[inset_0_0_0_2px_rgba(45,184,128,0.95),0_0_14px_-4px_rgba(45,184,128,0.45)]'
              : 'bg-white/[0.045] shadow-line hover:bg-white/[0.085]',
          ]"
          :title="account.label"
          type="button"
          @click="handleAccountClick(account.id)"
          @contextmenu="openContextMenu(account, $event)"
        >
          <ProviderLogo
            :provider-id="account.providerId"
            :favicon-url="faviconFor(account)"
            :size="22"
          />
          <span
            v-if="(unreadByAccount.get(account.id) ?? 0) > 0"
            class="absolute right-0 top-0 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent-coral px-1 text-[9px] font-bold leading-none tabular-nums text-white shadow-[0_0_0_2px_rgba(20,20,24,0.95)]"
          >
            {{ formatBadge(unreadByAccount.get(account.id) ?? 0) }}
          </span>
          <span
            v-else-if="account.providerId === 'slack' || account.providerId === 'teams'"
            class="absolute bottom-0 right-0 grid size-[14px] place-items-center rounded-full bg-ink-925 text-[9px] font-semibold text-zinc-300 ring-1 ring-ink-950"
          >
            {{ initialFor(account.label) }}
          </span>
        </button>
        <button
          v-if="isAudible(account.id)"
          type="button"
          class="app-no-drag absolute -bottom-1 -left-1 grid size-[18px] place-items-center rounded-full ring-2 ring-ink-925 transition"
          :class="
            mediaStateFor(account.id)?.muted
              ? 'bg-zinc-600 text-white hover:bg-zinc-500'
              : 'bg-accent-mint text-ink-950 hover:brightness-110'
          "
          :title="
            mediaStateFor(account.id)?.muted
              ? 'Reactiver le son'
              : 'Couper le son'
          "
          @click="handleToggleMute(account.id, $event)"
        >
          <component
            :is="mediaStateFor(account.id)?.muted ? VolumeX : Volume2"
            :size="10"
            :class="!mediaStateFor(account.id)?.muted ? 'animate-pulse' : undefined"
          />
        </button>
      </div>

      <button
        class="app-no-drag grid size-11 place-items-center rounded-xl border border-dashed border-white/[0.1] text-zinc-500 transition hover:border-white/[0.2] hover:text-zinc-200"
        title="Ajouter un service"
        type="button"
        @click="store.openAccountWorkflow()"
      >
        <Plus :size="18" />
      </button>
    </nav>

    <div class="my-2 h-px w-8 bg-white/[0.08]" />

    <button
      class="app-no-drag grid size-10 place-items-center rounded-xl transition"
      :class="
        store.activeView === 'settings'
          ? 'bg-white/[0.12] text-accent-mint shadow-[inset_0_0_0_2px_rgba(45,184,128,0.95),0_0_14px_-4px_rgba(45,184,128,0.45)]'
          : 'text-zinc-500 hover:bg-white/[0.07] hover:text-zinc-100'
      "
      title="Reglages"
      type="button"
      @click="store.setView('settings')"
    >
      <Settings :size="18" />
    </button>

    <div
      v-if="contextMenu"
      data-account-context-menu
      class="fixed z-50 min-w-[180px] overflow-hidden rounded-xl border border-white/[0.06] bg-ink-925/98 py-1 shadow-lift backdrop-blur"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      role="menu"
    >
      <button
        class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-zinc-200 transition hover:bg-accent-coral/10 hover:text-accent-coral disabled:opacity-40"
        :disabled="store.isWorking"
        type="button"
        role="menuitem"
        @click="handleDisconnect"
      >
        <Unplug :size="15" />
        <span>Deconnecter</span>
      </button>
    </div>
  </aside>
</template>

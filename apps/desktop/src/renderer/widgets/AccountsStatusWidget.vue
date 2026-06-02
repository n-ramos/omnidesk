<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2, CircleAlert, CircleSlash, RefreshCw, Server } from 'lucide-vue-next'
import ProviderLogo from '@renderer/components/ui/ProviderLogo.vue'
import Spinner from '@renderer/components/ui/Spinner.vue'
import { useAppStore } from '@renderer/stores/appStore'
import type { AccountSetupStatus, AccountSummary } from '@shared/models'

defineProps<{
  config?: Record<string, unknown>
  editMode: boolean
}>()

const store = useAppStore()

const accounts = computed<AccountSummary[]>(() =>
  [...store.accounts].sort((left, right) => left.label.localeCompare(right.label)),
)

const statusTone = (status: AccountSetupStatus): { icon: typeof CheckCircle2; tone: string; label: string } => {
  switch (status) {
    case 'connected':
      return { icon: CheckCircle2, tone: 'text-accent-mint', label: 'Connecte' }
    case 'error':
      return { icon: CircleAlert, tone: 'text-accent-coral', label: 'Erreur' }
    case 'pending_setup':
      return { icon: CircleSlash, tone: 'text-accent-gold', label: 'En attente' }
    case 'draft':
    default:
      return { icon: CircleSlash, tone: 'text-zinc-500', label: 'Brouillon' }
  }
}

const formatRelative = (value?: string): string => {
  if (!value) {
    return 'Jamais synchronise'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.round(diffMs / 60_000)
  if (diffMinutes < 1) return "A l'instant"
  if (diffMinutes < 60) return `Il y a ${diffMinutes} min`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `Il y a ${diffHours} h`
  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 30) return `Il y a ${diffDays} j`
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

const refreshOne = (accountId: string): void => {
  void store.refreshAccount(accountId)
}

const refreshAll = (): void => {
  for (const account of accounts.value) {
    if (account.setupStatus === 'connected') {
      void store.refreshAccount(account.id)
    }
  }
}

const hasConnected = computed(() =>
  accounts.value.some((account) => account.setupStatus === 'connected'),
)
</script>

<template>
  <div class="flex h-full flex-col p-5">
    <div class="mb-3 flex items-center justify-between">
      <span class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        <Server :size="13" />
        Etat des comptes
      </span>
      <button
        v-if="hasConnected"
        class="flex items-center gap-1.5 rounded-md bg-white/[0.055] px-2 py-1 text-[11px] text-zinc-300 transition hover:bg-white/[0.085] disabled:opacity-40"
        :disabled="store.isWorking"
        title="Tout synchroniser"
        type="button"
        @click="refreshAll"
      >
        <Spinner v-if="store.isWorking" :size="11" label="Synchronisation" />
        <RefreshCw v-else :size="11" />
        Tout sync
      </button>
    </div>

    <div v-if="accounts.length === 0" class="flex flex-1 items-center justify-center text-sm text-zinc-500">
      Aucun compte configure.
    </div>

    <div v-else class="grid min-h-0 flex-1 content-start gap-1.5 overflow-auto scroll-thin">
      <div
        v-for="account in accounts"
        :key="account.id"
        class="flex items-center gap-3 rounded-xl bg-ink-950/55 px-3 py-2"
      >
        <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.05]">
          <ProviderLogo :provider-id="account.providerId" :size="15" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-zinc-100">{{ account.label }}</p>
          <p class="truncate text-xs text-zinc-500">{{ formatRelative(account.lastSyncAt) }}</p>
        </div>
        <span
          class="flex shrink-0 items-center gap-1 text-[11px] font-medium"
          :class="statusTone(account.setupStatus).tone"
        >
          <component :is="statusTone(account.setupStatus).icon" :size="13" />
          {{ statusTone(account.setupStatus).label }}
        </span>
        <button
          v-if="account.setupStatus === 'connected'"
          class="grid size-7 shrink-0 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-40"
          :disabled="store.isWorking"
          title="Synchroniser ce compte"
          type="button"
          @click="refreshOne(account.id)"
        >
          <RefreshCw :size="13" />
        </button>
      </div>
    </div>
  </div>
</template>

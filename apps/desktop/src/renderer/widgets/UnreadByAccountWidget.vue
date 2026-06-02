<script setup lang="ts">
import { computed } from 'vue'
import { Inbox } from 'lucide-vue-next'
import ProviderLogo from '@renderer/components/ui/ProviderLogo.vue'
import { useAppStore } from '@renderer/stores/appStore'
import type { AccountSummary } from '@shared/models'

defineProps<{
  config?: Record<string, unknown>
  editMode: boolean
}>()

const store = useAppStore()

interface AccountEntry {
  account: AccountSummary
  unread: number
}

const entries = computed<AccountEntry[]>(() => {
  const unreadMap = store.unreadByAccount
  return store.connectedAccounts
    .map((account) => ({ account, unread: unreadMap.get(account.id) ?? 0 }))
    .sort((left, right) => right.unread - left.unread)
})

const openAccount = (accountId: string): void => {
  void store.selectAccount(accountId)
}
</script>

<template>
  <div class="flex h-full flex-col p-5">
    <div class="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
      <Inbox :size="13" />
      Messages non lus
    </div>

    <div v-if="entries.length === 0" class="flex flex-1 items-center justify-center text-sm text-zinc-500">
      Aucun compte connecte.
    </div>

    <div v-else class="grid min-h-0 flex-1 content-start gap-1.5 overflow-auto">
      <button
        v-for="entry in entries"
        :key="entry.account.id"
        class="flex items-center gap-3 rounded-xl bg-ink-950/55 px-3 py-2 text-left transition hover:bg-white/[0.06]"
        type="button"
        @click="openAccount(entry.account.id)"
      >
        <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.05]">
          <ProviderLogo :provider-id="entry.account.providerId" :size="15" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium text-zinc-100">{{ entry.account.label }}</span>
          <span class="block truncate text-xs text-zinc-500">
            {{ entry.account.emailAddress ?? entry.account.providerId }}
          </span>
        </span>
        <span
          class="grid h-6 min-w-[28px] place-items-center rounded-md px-1.5 text-[11px] font-semibold"
          :class="entry.unread > 0 ? 'bg-accent-mint/15 text-accent-mint' : 'bg-white/5 text-zinc-500'"
        >
          {{ entry.unread }}
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Activity, ArrowDown, ArrowRight, ArrowUp, Minus } from 'lucide-vue-next'
import ProviderLogo from '@renderer/components/ui/ProviderLogo.vue'
import { useAppStore } from '@renderer/stores/appStore'
import type { LocalNotification, ProviderKind } from '@shared/models'

defineProps<{
  config?: Record<string, unknown>
  editMode: boolean
}>()

const store = useAppStore()

const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth()
  && a.getDate() === b.getDate()

const startOfYesterday = (): Date => {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  return date
}

interface AccountBucket {
  accountId: string
  label: string
  providerId: ProviderKind
  today: number
}

const stats = computed(() => {
  const today = new Date()
  const yesterday = startOfYesterday()
  let todayCount = 0
  let yesterdayCount = 0
  const perAccount = new Map<string, AccountBucket>()

  const consider = (notification: LocalNotification): void => {
    const date = new Date(notification.createdAt)
    if (Number.isNaN(date.getTime())) {
      return
    }
    if (isSameDay(date, today)) {
      todayCount += 1
      if (notification.accountId) {
        const account = store.accounts.find((entry) => entry.id === notification.accountId)
        if (account) {
          const bucket = perAccount.get(account.id) ?? {
            accountId: account.id,
            label: account.label,
            providerId: account.providerId,
            today: 0,
          }
          bucket.today += 1
          perAccount.set(account.id, bucket)
        }
      }
    } else if (isSameDay(date, yesterday)) {
      yesterdayCount += 1
    }
  }

  for (const notification of store.notifications) {
    consider(notification)
  }

  const buckets = [...perAccount.values()].sort((left, right) => right.today - left.today)
  const max = buckets[0]?.today ?? 0

  return { todayCount, yesterdayCount, buckets, max }
})

const trend = computed(() => {
  const { todayCount, yesterdayCount } = stats.value
  if (yesterdayCount === 0) {
    return { icon: Minus, tone: 'text-zinc-500', label: 'Pas de comparaison' }
  }
  const diff = todayCount - yesterdayCount
  if (diff > 0) {
    return { icon: ArrowUp, tone: 'text-accent-mint', label: `+${diff} vs hier` }
  }
  if (diff < 0) {
    return { icon: ArrowDown, tone: 'text-accent-coral', label: `${diff} vs hier` }
  }
  return { icon: ArrowRight, tone: 'text-zinc-400', label: 'Identique a hier' }
})
</script>

<template>
  <div class="flex h-full flex-col p-5">
    <div class="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
      <Activity :size="13" />
      Activite du jour
    </div>

    <div class="mb-4">
      <p class="text-4xl font-semibold tracking-tight text-white tabular-nums">
        {{ stats.todayCount }}
      </p>
      <p class="mt-1 flex items-center gap-1.5 text-xs" :class="trend.tone">
        <component :is="trend.icon" :size="12" />
        {{ trend.label }}
      </p>
    </div>

    <div v-if="stats.buckets.length === 0" class="flex flex-1 items-center justify-center text-sm text-zinc-500">
      Aucune notification aujourd'hui.
    </div>

    <div v-else class="scroll-thin grid min-h-0 flex-1 content-start gap-2 overflow-auto">
      <div
        v-for="bucket in stats.buckets"
        :key="bucket.accountId"
        class="rounded-xl bg-ink-950/55 px-3 py-2"
      >
        <div class="mb-1.5 flex items-center gap-2">
          <span class="grid size-6 shrink-0 place-items-center rounded-md bg-white/[0.05]">
            <ProviderLogo :provider-id="bucket.providerId" :size="13" />
          </span>
          <span class="min-w-0 flex-1 truncate text-xs text-zinc-200">{{ bucket.label }}</span>
          <span class="shrink-0 text-xs font-semibold tabular-nums text-zinc-300">{{ bucket.today }}</span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
          <div
            class="h-full rounded-full bg-accent-mint"
            :style="{ width: stats.max > 0 ? `${(bucket.today / stats.max) * 100}%` : '0%' }"
          />
        </div>
      </div>
    </div>
  </div>
</template>

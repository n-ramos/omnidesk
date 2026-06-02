<script setup lang="ts">
import { computed } from 'vue'
import { Bell } from 'lucide-vue-next'
import { useAppStore } from '@renderer/stores/appStore'

defineProps<{
  config?: Record<string, unknown>
  editMode: boolean
}>()

const store = useAppStore()

const recent = computed(() =>
  [...store.notifications]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 6),
)

const formatTime = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const openNotifications = (): void => {
  store.setView('notifications')
}
</script>

<template>
  <div class="flex h-full flex-col p-5">
    <div class="mb-3 flex items-center justify-between">
      <span class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        <Bell :size="13" />
        Notifications recentes
      </span>
      <button
        class="text-[11px] text-zinc-400 hover:text-zinc-100"
        type="button"
        @click="openNotifications"
      >
        Voir tout
      </button>
    </div>

    <div
      v-if="recent.length === 0"
      class="flex flex-1 items-center justify-center text-sm text-zinc-500"
    >
      Aucune notification recente.
    </div>

    <ul v-else class="grid min-h-0 flex-1 content-start gap-1.5 overflow-auto">
      <li
        v-for="notification in recent"
        :key="notification.id"
        class="rounded-xl bg-ink-950/55 px-3 py-2"
      >
        <div class="flex items-baseline justify-between gap-3">
          <p class="truncate text-sm font-semibold text-zinc-100">{{ notification.title }}</p>
          <span class="shrink-0 text-[11px] text-zinc-500">{{ formatTime(notification.createdAt) }}</span>
        </div>
        <p v-if="notification.body" class="mt-0.5 truncate text-xs text-zinc-500">
          {{ notification.body }}
        </p>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { Bell, CheckCheck, Trash2 } from 'lucide-vue-next'
import { useAppStore } from '@renderer/stores/appStore'
import type { LocalNotification } from '@shared/models'

const store = useAppStore()
const isOpen = ref(false)
const isConfirmingClear = ref(false)
const wrapperRef = ref<HTMLElement | null>(null)

const unreadCount = computed(() => store.unreadNotificationCount)
const notifications = computed(() => store.notifications)

const formatBadge = (count: number): string => (count > 99 ? '99+' : String(count))

const formatTime = (iso?: string): string => {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleString([], {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const toggle = (): void => {
  isOpen.value = !isOpen.value
  if (!isOpen.value) {
    isConfirmingClear.value = false
  }
}

const close = (): void => {
  isOpen.value = false
  isConfirmingClear.value = false
}

const handleMarkRead = (notificationId: string): void => {
  void store.markNotificationRead(notificationId)
}

const requestClearAll = (): void => {
  isConfirmingClear.value = true
}

const cancelClearAll = (): void => {
  isConfirmingClear.value = false
}

const confirmClearAll = async (): Promise<void> => {
  try {
    await store.clearAllNotifications()
  } finally {
    isConfirmingClear.value = false
  }
}

const handleNotificationClick = async (
  notification: LocalNotification,
): Promise<void> => {
  if (!notification.conversationId) {
    return
  }

  store.setView('inbox')
  await store.selectConversation(notification.conversationId)
  close()
}

const onDocumentClick = (event: MouseEvent): void => {
  if (!isOpen.value) {
    return
  }
  const target = event.target as Node | null
  if (target && wrapperRef.value && !wrapperRef.value.contains(target)) {
    close()
  }
}

const onKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape' && isOpen.value) {
    close()
  }
}

document.addEventListener('mousedown', onDocumentClick)
document.addEventListener('keydown', onKeydown)

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="wrapperRef" class="relative">
    <button
      class="app-no-drag relative grid size-8 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
      :class="{ 'bg-white/[0.08] text-zinc-100': isOpen }"
      type="button"
      title="Notifications"
      :aria-expanded="isOpen"
      @click="toggle"
    >
      <Bell :size="16" />
      <span
        v-if="unreadCount > 0"
        class="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent-coral px-1 text-[9px] font-bold leading-none tabular-nums text-white shadow-[0_0_0_2px_rgba(20,20,24,0.95)]"
      >
        {{ formatBadge(unreadCount) }}
      </span>
    </button>

    <div
      v-if="isOpen"
      class="absolute right-0 top-full z-50 mt-1.5 flex max-h-[520px] w-[360px] flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-ink-925 shadow-lift"
    >
      <header class="flex items-center justify-between gap-3 border-b border-white/[0.04] px-4 py-2.5">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-zinc-100">Notifications</span>
          <span class="text-[10px] uppercase tracking-wide text-zinc-500">
            {{ unreadCount }} non lu{{ unreadCount > 1 ? 's' : '' }}
          </span>
        </div>
        <button
          v-if="notifications.length > 0 && !isConfirmingClear"
          class="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-zinc-400 transition hover:bg-white/[0.06] hover:text-rose-300"
          type="button"
          title="Tout effacer"
          @click="requestClearAll"
        >
          <Trash2 :size="12" />
          Effacer
        </button>
      </header>

      <div
        v-if="isConfirmingClear"
        class="flex items-center justify-between gap-3 border-b border-rose-500/30 bg-rose-500/10 px-4 py-2.5"
      >
        <span class="text-xs text-rose-100">
          Effacer toutes les notifications ?
        </span>
        <div class="flex items-center gap-1">
          <button
            class="rounded-md px-2 py-1 text-[11px] text-zinc-300 transition hover:bg-white/[0.08]"
            type="button"
            @click="cancelClearAll"
          >
            Annuler
          </button>
          <button
            class="rounded-md bg-rose-500/80 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-rose-500"
            type="button"
            @click="confirmClearAll"
          >
            Confirmer
          </button>
        </div>
      </div>

      <div
        v-if="notifications.length === 0"
        class="grid min-h-[160px] place-items-center px-6 text-center"
      >
        <div>
          <div
            class="mx-auto mb-2 grid size-9 place-items-center rounded-xl bg-accent-mint/10 text-accent-mint"
          >
            <CheckCheck :size="18" />
          </div>
          <p class="text-xs text-zinc-500">Tout est calme. Aucune notification.</p>
        </div>
      </div>

      <div v-else class="flex-1 overflow-y-auto">
        <div
          v-for="notification in notifications"
          :key="notification.id"
          class="group/notification flex items-start gap-3 border-b border-white/[0.03] px-4 py-3 transition hover:bg-white/[0.04] last:border-b-0"
          :class="notification.conversationId ? 'cursor-pointer' : 'cursor-default'"
          role="button"
          tabindex="0"
          @click="handleNotificationClick(notification)"
          @keydown.enter="handleNotificationClick(notification)"
        >
          <span
            class="mt-1 size-2 shrink-0 rounded-full"
            :class="notification.readAt ? 'ring-1 ring-zinc-700' : 'bg-accent-coral'"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-zinc-100">{{ notification.title }}</p>
            <p
              v-if="notification.body"
              class="mt-0.5 line-clamp-2 text-xs text-zinc-500"
            >
              {{ notification.body }}
            </p>
            <p class="mt-1 text-[10px] text-zinc-600">
              {{ formatTime(notification.createdAt) }}
            </p>
          </div>
          <button
            v-if="!notification.readAt"
            class="grid size-6 shrink-0 place-items-center rounded text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
            type="button"
            title="Marquer comme lu"
            @click.stop="handleMarkRead(notification.id)"
          >
            <CheckCheck :size="13" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

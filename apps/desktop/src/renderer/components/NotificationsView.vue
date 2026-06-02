<script setup lang="ts">
import { Bell, CheckCheck } from 'lucide-vue-next'
import BaseButton from '@renderer/components/ui/BaseButton.vue'
import StatusBadge from '@renderer/components/ui/StatusBadge.vue'
import { useAppStore } from '@renderer/stores/appStore'

const store = useAppStore()
</script>

<template>
  <section class="min-h-0 flex-1 overflow-auto p-5">
    <header class="mb-5 flex items-center justify-between">
      <div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Notifications
        </p>
        <h2 class="mt-1 text-xl font-semibold text-white">Centre de notifications</h2>
      </div>
      <StatusBadge tone="neutral">{{ store.unreadNotificationCount }} non lus</StatusBadge>
    </header>

    <div v-if="store.notifications.length > 0" class="grid gap-2">
      <article
        v-for="notification in store.notifications"
        :key="notification.id"
        class="flex items-start justify-between gap-4 rounded-2xl bg-white/[0.04] p-4 shadow-line"
      >
        <div class="min-w-0">
          <div class="mb-2 flex items-center gap-2">
            <Bell class="text-accent-sky" :size="16" />
            <h3 class="truncate text-sm font-semibold text-zinc-100">{{ notification.title }}</h3>
          </div>
          <p v-if="notification.body" class="text-sm leading-6 text-zinc-500">
            {{ notification.body }}
          </p>
          <p class="mt-2 text-xs text-zinc-600">{{ notification.createdAt }}</p>
        </div>
        <BaseButton
          v-if="!notification.readAt"
          variant="secondary"
          @click="store.markNotificationRead(notification.id)"
        >
          <CheckCheck :size="16" />
          Marquer comme lu
        </BaseButton>
      </article>
    </div>

    <div v-else class="grid min-h-[420px] place-items-center rounded-2xl bg-white/[0.035] shadow-line">
      <div class="max-w-sm text-center">
        <div
          class="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-accent-mint/10 text-accent-mint"
        >
          <CheckCheck :size="22" />
        </div>
        <h3 class="text-base font-semibold text-white">Aucune notification</h3>
        <p class="mt-2 text-sm leading-6 text-zinc-500">
          Cette zone restera vide tant que l'application n'aura rien a te signaler.
        </p>
      </div>
    </div>
  </section>
</template>

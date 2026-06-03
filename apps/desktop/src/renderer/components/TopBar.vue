<script setup lang="ts">
import NotificationsBell from '@renderer/components/NotificationsBell.vue'
import UpdateIndicator from '@renderer/components/UpdateIndicator.vue'

defineProps<{
  isMac?: boolean
}>()
</script>

<template>
  <header
    class="app-drag relative z-30 flex h-11 shrink-0 items-center justify-end border-b border-white/[0.04] bg-ink-950/85 py-1.5 pr-3"
    :class="isMac ? 'pl-[84px]' : 'pl-3'"
  >
    <div class="app-no-drag flex items-center gap-1">
      <UpdateIndicator />
      <NotificationsBell />
    </div>
  </header>
</template>

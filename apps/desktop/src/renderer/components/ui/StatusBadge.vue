<script setup lang="ts">
defineProps<{
  tone?: 'neutral' | 'success' | 'warning' | 'info' | 'danger'
}>()
</script>

<template>
  <span
    class="inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold uppercase tracking-[0.08em] shadow-line"
    :class="{
      'bg-white/7 text-zinc-300': tone === 'neutral' || !tone,
      'bg-accent-mint/12 text-accent-mint': tone === 'success',
      'bg-accent-gold/12 text-accent-gold': tone === 'warning',
      'bg-accent-sky/12 text-accent-sky': tone === 'info',
      'bg-accent-coral/12 text-accent-coral': tone === 'danger',
    }"
  >
    <slot />
  </span>
</template>

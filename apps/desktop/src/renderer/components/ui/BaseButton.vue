<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
}>()
</script>

<template>
  <button
    :disabled="disabled"
    class="app-no-drag inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium tracking-normal transition duration-150 disabled:cursor-not-allowed disabled:opacity-45"
    :class="{
      'bg-accent-mint text-ink-950 shadow-lift hover:bg-[#a5f0ce]': variant === 'primary',
      'bg-white/[0.055] text-zinc-100 shadow-line hover:bg-white/[0.085]': variant === 'secondary' || !variant,
      'text-zinc-400 hover:bg-white/7 hover:text-zinc-100': variant === 'ghost',
    }"
  >
    <slot />
  </button>
</template>

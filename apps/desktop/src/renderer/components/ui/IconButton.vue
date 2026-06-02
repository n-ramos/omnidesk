<script setup lang="ts">
defineProps<{
  label: string
  active?: boolean
}>()
</script>

<template>
  <button
    :aria-label="label"
    :title="label"
    class="app-no-drag relative grid size-10 place-items-center rounded-lg text-zinc-500 transition duration-150 hover:bg-white/7 hover:text-zinc-100"
    :class="{ 'bg-white/[0.07] text-white shadow-line': active }"
  >
    <span
      v-if="active"
      class="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent-mint"
    />
    <slot />
  </button>
</template>

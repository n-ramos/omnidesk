<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    size?: number
    label?: string
  }>(),
  {
    size: 14,
    label: 'Chargement en cours',
  },
)
</script>

<template>
  <Loader2 :size="size" :aria-label="label" class="animate-spin" role="status" />
</template>

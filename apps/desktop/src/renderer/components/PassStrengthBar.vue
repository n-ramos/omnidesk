<script setup lang="ts">
import { computed } from 'vue'
import { evaluatePasswordStrength } from '@renderer/utils/passwordStrength'

const props = defineProps<{ password: string }>()

const strength = computed(() => evaluatePasswordStrength(props.password))
const barClass = computed(() =>
  strength.value.tone === 'mint'
    ? 'bg-accent-mint'
    : strength.value.tone === 'gold'
      ? 'bg-accent-gold'
      : 'bg-accent-coral',
)
const textClass = computed(() =>
  strength.value.tone === 'mint'
    ? 'text-accent-mint'
    : strength.value.tone === 'gold'
      ? 'text-accent-gold'
      : 'text-accent-coral',
)
const widthPct = computed(() => `${(strength.value.score / 4) * 100}%`)
</script>

<template>
  <div class="flex items-center gap-2">
    <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
      <div class="h-full rounded-full transition-all" :class="barClass" :style="{ width: widthPct }" />
    </div>
    <span class="shrink-0 text-[11px] font-medium" :class="textClass">{{ strength.label }}</span>
  </div>
</template>

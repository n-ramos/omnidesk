<script setup lang="ts">
import { computed } from 'vue'
import { Quote } from 'lucide-vue-next'
import { dailyQuote, type QuoteEntry } from '@renderer/data/quotes'

defineProps<{
  config?: Record<string, unknown>
  editMode: boolean
}>()

const todaysQuote = computed<QuoteEntry>(() => dailyQuote())
</script>

<template>
  <div class="flex h-full flex-col p-5">
    <div class="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
      <Quote :size="13" />
      Citation du jour
    </div>

    <div class="flex flex-1 flex-col justify-center gap-3">
      <p class="text-base leading-7 text-zinc-100">
        <span class="text-accent-mint">« </span>{{ todaysQuote.text }}<span class="text-accent-mint"> »</span>
      </p>
      <p class="text-sm text-zinc-500">— {{ todaysQuote.author }}</p>
    </div>
  </div>
</template>

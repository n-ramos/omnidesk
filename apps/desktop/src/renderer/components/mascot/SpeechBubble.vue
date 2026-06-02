<script setup lang="ts">
import { computed } from 'vue'
import { BellRing, Quote as QuoteIcon, Sparkles, X } from 'lucide-vue-next'
import type { MascotMessageKind } from '@renderer/stores/mascotStore'

const props = defineProps<{
  kind: MascotMessageKind
  title?: string
  text: string
  author?: string
  durationMs: number
}>()

defineEmits<{
  (event: 'close'): void
  (event: 'elapsed'): void
}>()

const accentClass = computed(() => {
  switch (props.kind) {
    case 'reminder':
      return 'text-accent-gold'
    case 'nudge':
      return 'text-accent-sky'
    default:
      return 'text-accent-mint'
  }
})

const headerLabel = computed(() => {
  if (props.title) return props.title
  if (props.kind === 'reminder') return 'Pense-bete'
  if (props.kind === 'nudge') return 'Petit rappel'
  return 'Elodie'
})

const isQuote = computed(() => props.kind === 'quote')
</script>

<template>
  <div
    class="omnihoowl-bubble relative w-[clamp(220px,70vw,300px)] rounded-2xl bg-ink-900/95 p-3.5 pr-9 text-sm text-zinc-100 shadow-lift ring-1 ring-white/[0.06] backdrop-blur"
  >
    <button
      type="button"
      class="absolute right-2 top-2 grid size-6 place-items-center rounded-md text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
      aria-label="Fermer"
      @click="$emit('close')"
    >
      <X :size="13" />
    </button>

    <div
      class="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]"
      :class="accentClass"
    >
      <BellRing v-if="kind === 'reminder'" :size="13" />
      <Sparkles v-else-if="kind === 'nudge'" :size="13" />
      <QuoteIcon v-else :size="13" />
      <span>{{ headerLabel }}</span>
    </div>

    <p class="leading-6 text-zinc-100" :class="{ italic: isQuote }">
      <template v-if="isQuote">
        <span class="text-accent-mint">&laquo; </span>{{ text }}<span class="text-accent-mint"> &raquo;</span>
      </template>
      <template v-else>{{ text }}</template>
    </p>
    <p v-if="author" class="mt-1 text-xs text-zinc-500">&mdash; {{ author }}</p>

    <span
      class="omnihoowl-progress pointer-events-none"
      :style="{ animationDuration: `${durationMs}ms` }"
      @animationend="$emit('elapsed')"
    />

    <span class="omnihoowl-tail" aria-hidden="true" />
  </div>
</template>

<style scoped>
.omnihoowl-bubble {
  transform-origin: bottom right;
  animation: omnihoowl-bubble-in 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.omnihoowl-tail {
  position: absolute;
  right: 28px;
  bottom: -6px;
  height: 14px;
  width: 14px;
  border-radius: 3px;
  background: rgb(18 21 27 / 0.95);
  box-shadow: 1px 1px 0 0 rgba(255, 255, 255, 0.06);
  transform: rotate(45deg);
}

.omnihoowl-progress {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 7px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgb(var(--accent-mint) / 0.55), rgba(139, 188, 255, 0.45));
  transform-origin: left center;
  animation-name: omnihoowl-progress;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}

@keyframes omnihoowl-bubble-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes omnihoowl-progress {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .omnihoowl-bubble {
    animation: none;
  }
  .omnihoowl-progress {
    display: none;
  }
}
</style>

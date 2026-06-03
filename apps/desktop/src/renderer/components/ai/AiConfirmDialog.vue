<script setup lang="ts">
import { computed } from 'vue'
import { Check, ShieldQuestion, X } from 'lucide-vue-next'
import { useAiChatStore } from '@renderer/stores/aiChatStore'

const chat = useAiChatStore()
const pending = computed(() => chat.pendingConfirmation)

const approve = (): void => chat.respondConfirmation(true)
const refuse = (): void => chat.respondConfirmation(false)
</script>

<template>
  <Transition name="ai-confirm">
    <div
      v-if="pending"
      class="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4"
      @click.self="refuse"
    >
      <div class="w-full max-w-md overflow-hidden rounded-2xl bg-ink-900 shadow-2xl shadow-black/60 ring-1 ring-white/10">
        <header class="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <ShieldQuestion class="text-accent-mint" :size="18" />
          <h3 class="text-sm font-semibold text-white">{{ pending.preview.title }}</h3>
        </header>

        <div class="space-y-3 px-4 py-4">
          <p class="text-sm leading-6 text-zinc-200">{{ pending.preview.summary }}</p>

          <dl
            v-if="pending.preview.details && pending.preview.details.length > 0"
            class="space-y-1.5 rounded-xl bg-ink-950/55 p-3"
          >
            <div v-for="detail in pending.preview.details" :key="detail.label" class="flex gap-2 text-sm">
              <dt class="w-16 shrink-0 font-medium text-zinc-400">{{ detail.label }}</dt>
              <dd class="min-w-0 flex-1 whitespace-pre-wrap break-words text-zinc-100">
                {{ detail.value }}
              </dd>
            </div>
          </dl>

          <p class="text-xs leading-5 text-accent-coral">{{ pending.preview.effect }}</p>
        </div>

        <footer class="flex justify-end gap-2 border-t border-white/10 px-4 py-3">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-3.5 py-2 text-sm font-medium text-zinc-200 ring-1 ring-white/10 transition hover:bg-white/[0.09]"
            @click="refuse"
          >
            <X :size="15" />
            Refuser
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg bg-accent-mint px-3.5 py-2 text-sm font-semibold text-ink-950 shadow-lift transition hover:bg-[#a5f0ce]"
            @click="approve"
          >
            <Check :size="15" />
            Valider
          </button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ai-confirm-enter-active,
.ai-confirm-leave-active {
  transition: opacity 150ms ease;
}
.ai-confirm-enter-from,
.ai-confirm-leave-to {
  opacity: 0;
}
</style>

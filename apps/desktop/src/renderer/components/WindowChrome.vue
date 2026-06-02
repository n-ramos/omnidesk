<script setup lang="ts">
import { Maximize2, Minus, X } from 'lucide-vue-next'
import { ref } from 'vue'

const actionMessage = ref('')

const minimize = (): void => {
  if (!window.omnidesk) {
    actionMessage.value = "La fenetre n'est pas encore prete."
    return
  }

  void window.omnidesk.window.minimize().catch(() => {
    actionMessage.value = 'Impossible de réduire la fenêtre.'
  })
}

const maximize = (): void => {
  if (!window.omnidesk) {
    actionMessage.value = "La fenetre n'est pas encore prete."
    return
  }

  void window.omnidesk.window.maximize().catch(() => {
    actionMessage.value = "Impossible d'agrandir la fenêtre."
  })
}

const close = (): void => {
  if (!window.omnidesk) {
    actionMessage.value = "La fenetre n'est pas encore prete."
    return
  }

  void window.omnidesk.window.close().catch(() => {
    actionMessage.value = 'Impossible de fermer la fenêtre.'
  })
}
</script>

<template>
  <header class="flex h-11 shrink-0 items-center border-b border-white/[0.035] bg-ink-950/82 px-3">
    <div class="app-no-drag flex items-center gap-1">
      <button
        aria-label="Fermer"
        class="app-no-drag grid size-4 place-items-center rounded-full bg-[#ff5f57] text-transparent transition hover:text-black/55"
        type="button"
        @mousedown.stop
        @click.stop="close"
      >
        <X :size="8" />
      </button>
      <button
        aria-label="Réduire"
        class="app-no-drag grid size-4 place-items-center rounded-full bg-[#ffbd2e] text-transparent transition hover:text-black/55"
        type="button"
        @mousedown.stop
        @click.stop="minimize"
      >
        <Minus :size="8" />
      </button>
      <button
        aria-label="Agrandir"
        class="app-no-drag grid size-4 place-items-center rounded-full bg-[#28c840] text-transparent transition hover:text-black/55"
        type="button"
        @mousedown.stop
        @click.stop="maximize"
      >
        <Maximize2 :size="7" />
      </button>
    </div>

    <div class="app-drag flex h-full flex-1 items-center justify-center">
      <div class="pointer-events-none flex items-center gap-2">
        <span class="size-1.5 rounded-full bg-accent-mint/80" />
        <span class="text-xs font-medium text-zinc-500">Omnidesk</span>
      </div>
    </div>

    <div class="app-no-drag min-w-[120px] text-right text-xs text-zinc-500">
      {{ actionMessage }}
    </div>
  </header>
</template>

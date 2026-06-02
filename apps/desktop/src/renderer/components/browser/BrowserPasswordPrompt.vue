<script setup lang="ts">
import { computed } from 'vue'
import { KeyRound, X } from 'lucide-vue-next'
import { useBrowserStore } from '@renderer/stores/browserStore'

const store = useBrowserStore()
const prompt = computed(() => store.credentialPrompt)

// Affiche l'hote (sans le schema) pour la lisibilite du bandeau.
const host = computed(() => {
  const origin = prompt.value?.origin
  if (!origin) {
    return ''
  }
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
})
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    leave-active-class="transition duration-150 ease-in"
    enter-from-class="-translate-y-2 opacity-0"
    leave-to-class="-translate-y-2 opacity-0"
  >
    <div
      v-if="prompt"
      class="flex shrink-0 items-center gap-3 border-b border-white/[0.06] bg-ink-925/95 px-4 py-2.5"
    >
      <KeyRound :size="16" class="shrink-0 text-accent-mint" />
      <p class="min-w-0 flex-1 truncate text-sm text-zinc-200">
        Enregistrer le mot de passe pour
        <span class="font-medium text-white">{{ host }}</span>
        <span v-if="prompt.username" class="text-zinc-500"> ({{ prompt.username }})</span> ?
      </p>
      <button
        type="button"
        class="shrink-0 rounded-lg bg-accent-mint/15 px-3 py-1.5 text-sm font-medium text-accent-mint transition hover:bg-accent-mint/25"
        @click="store.saveCredentialFromPrompt()"
      >
        Enregistrer
      </button>
      <button
        type="button"
        class="shrink-0 rounded-lg px-2.5 py-1.5 text-sm text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
        @click="store.dismissCredentialPrompt()"
      >
        Ignorer
      </button>
      <button
        type="button"
        class="grid size-7 shrink-0 place-items-center rounded text-zinc-500 transition hover:bg-white/[0.08] hover:text-zinc-200"
        title="Fermer"
        @click="store.dismissCredentialPrompt()"
      >
        <X :size="14" />
      </button>
    </div>
  </Transition>
</template>

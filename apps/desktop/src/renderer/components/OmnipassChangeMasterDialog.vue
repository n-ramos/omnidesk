<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { KeySquare, X } from 'lucide-vue-next'
import Spinner from '@renderer/components/ui/Spinner.vue'
import PassStrengthBar from '@renderer/components/PassStrengthBar.vue'
import { useOmnipassStore } from '@renderer/stores/omnipassStore'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (event: 'close'): void; (event: 'changed'): void }>()

const store = useOmnipassStore()
const MIN_MASTER = 8

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')

const canSubmit = computed(
  () =>
    oldPassword.value.length > 0 &&
    newPassword.value.length >= MIN_MASTER &&
    newPassword.value === confirmPassword.value &&
    oldPassword.value !== newPassword.value &&
    !store.working,
)

const fieldClass =
  'w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-accent-mint/50 focus:bg-white/[0.06]'
const labelClass = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500'

watch(
  () => props.open,
  (open) => {
    if (!open) {
      return
    }
    store.error = undefined
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  },
)

const submit = async (): Promise<void> => {
  if (!canSubmit.value) {
    return
  }
  const ok = await store.changeMasterPassword(oldPassword.value, newPassword.value)
  if (ok) {
    emit('changed')
    emit('close')
  }
  // Sinon : erreur exposee via store.error, le dialog reste ouvert.
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-[60] grid place-items-center bg-ink-950/70 p-4 backdrop-blur-sm"
        @click.self="!store.working && emit('close')"
      >
        <div class="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900 shadow-lift">
          <header class="flex items-center gap-3 border-b border-white/[0.05] px-5 py-4">
            <span class="grid size-9 place-items-center rounded-xl bg-accent-mint/15 text-accent-mint">
              <KeySquare :size="18" />
            </span>
            <h2 class="flex-1 text-base font-semibold text-white">Changer le mot de passe maitre</h2>
            <button
              class="grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-40"
              type="button"
              aria-label="Fermer"
              :disabled="store.working"
              @click="emit('close')"
            >
              <X :size="16" />
            </button>
          </header>

          <div class="space-y-3.5 px-5 py-4">
            <div>
              <label :class="labelClass">Mot de passe actuel</label>
              <input v-model="oldPassword" :class="fieldClass" type="password" autocomplete="current-password" :disabled="store.working" />
            </div>
            <div>
              <label :class="labelClass">Nouveau mot de passe</label>
              <input v-model="newPassword" :class="fieldClass" type="password" autocomplete="new-password" :disabled="store.working" />
              <PassStrengthBar v-if="newPassword.length > 0" :password="newPassword" class="mt-2" />
            </div>
            <div>
              <label :class="labelClass">Confirmer le nouveau mot de passe</label>
              <input
                v-model="confirmPassword"
                :class="fieldClass"
                type="password"
                autocomplete="new-password"
                :disabled="store.working"
                @keyup.enter="submit"
              />
            </div>

            <div class="flex items-start gap-2 rounded-lg border border-accent-gold/20 bg-accent-gold/10 px-3 py-2.5 text-xs text-accent-gold">
              <span>Tout le coffre va etre re-chiffre. Ne fermez pas l'application pendant l'operation.</span>
            </div>
            <p
              v-if="confirmPassword.length > 0 && newPassword !== confirmPassword"
              class="text-xs text-accent-coral"
            >
              Les mots de passe ne correspondent pas.
            </p>
            <p v-if="store.error" class="text-xs text-accent-coral">{{ store.error }}</p>
          </div>

          <footer class="flex items-center justify-end gap-2 border-t border-white/[0.05] px-5 py-3.5">
            <button
              class="inline-flex h-9 items-center rounded-md px-3.5 text-sm font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-40"
              type="button"
              :disabled="store.working"
              @click="emit('close')"
            >
              Annuler
            </button>
            <button
              class="inline-flex h-9 items-center gap-2 rounded-md bg-accent-mint px-3.5 text-sm font-medium text-ink-950 shadow-lift transition hover:bg-[#a5f0ce] disabled:cursor-not-allowed disabled:opacity-45"
              type="button"
              :disabled="!canSubmit"
              @click="submit"
            >
              <Spinner v-if="store.working" :size="14" />
              <span>{{ store.working ? 'Re-chiffrement...' : 'Changer' }}</span>
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Eye, EyeOff, KeyRound, RefreshCw, X } from 'lucide-vue-next'
import Spinner from '@renderer/components/ui/Spinner.vue'
import PassStrengthBar from '@renderer/components/PassStrengthBar.vue'
import OmnipassGeneratorDialog from '@renderer/components/OmnipassGeneratorDialog.vue'
import { useOmnipassStore } from '@renderer/stores/omnipassStore'
import type { PassEntrySummary } from '@shared/models'

const props = defineProps<{ open: boolean; entry: PassEntrySummary | null; folderId: string | null }>()
const emit = defineEmits<{ (event: 'close'): void; (event: 'saved'): void }>()

const store = useOmnipassStore()

const title = ref('')
const username = ref('')
const url = ref('')
const password = ref('')
const notes = ref('')
const showPassword = ref(false)
const loadingSecret = ref(false)

const isEdit = computed(() => props.entry !== null)
const canSave = computed(
  () => title.value.trim().length > 0 && password.value.length > 0 && !store.working,
)

const fieldClass =
  'w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-accent-mint/50 focus:bg-white/[0.06]'
const labelClass = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500'

// A l'ouverture : formulaire vierge en creation ; pre-remplissage (avec revelation du secret) en
// edition. Le secret n'est demande qu'a ce moment, pour cette entree precise.
watch(
  () => props.open,
  async (open) => {
    if (!open) {
      return
    }
    store.error = undefined
    showPassword.value = false
    const entry = props.entry
    if (!entry) {
      title.value = ''
      username.value = ''
      url.value = ''
      password.value = ''
      notes.value = ''
      return
    }
    title.value = entry.title
    username.value = entry.username ?? ''
    url.value = entry.url ?? ''
    password.value = ''
    notes.value = ''
    loadingSecret.value = true
    try {
      const secret = await store.reveal(entry.id)
      if (secret && props.open && props.entry?.id === entry.id) {
        password.value = secret.password
        notes.value = secret.notes ?? ''
      }
    } finally {
      loadingSecret.value = false
    }
  },
)

const generatorOpen = ref(false)

const onUsePassword = (generated: string): void => {
  password.value = generated
  showPassword.value = true
}

const submit = async (): Promise<void> => {
  if (!canSave.value) {
    return
  }
  const entry = props.entry
  try {
    if (entry) {
      await store.updateEntry({
        id: entry.id,
        title: title.value.trim(),
        username: username.value.trim() || null,
        url: url.value.trim() || null,
        password: password.value,
        notes: notes.value.trim() || null,
      })
    } else {
      await store.createEntry({
        title: title.value.trim(),
        username: username.value.trim() || undefined,
        url: url.value.trim() || undefined,
        password: password.value,
        notes: notes.value.trim() || undefined,
        folderId: props.folderId,
      })
    }
    emit('saved')
    emit('close')
  } catch {
    // Erreur exposee via store.error.
  }
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
        @click.self="emit('close')"
      >
        <div
          class="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900 shadow-lift"
        >
          <header class="flex items-center gap-3 border-b border-white/[0.05] px-5 py-4">
            <span class="grid size-9 place-items-center rounded-xl bg-accent-mint/15 text-accent-mint">
              <KeyRound :size="18" />
            </span>
            <h2 class="flex-1 text-base font-semibold text-white">
              {{ isEdit ? 'Modifier l entree' : 'Nouvelle entree' }}
            </h2>
            <button
              class="grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
              type="button"
              aria-label="Fermer"
              @click="emit('close')"
            >
              <X :size="16" />
            </button>
          </header>

          <div class="space-y-3.5 px-5 py-4">
            <div>
              <label :class="labelClass">Titre</label>
              <input v-model="title" :class="fieldClass" type="text" placeholder="Ex. Banque, Messagerie..." />
            </div>
            <div>
              <label :class="labelClass">Identifiant</label>
              <input v-model="username" :class="fieldClass" type="text" placeholder="Nom d utilisateur ou email" autocomplete="off" />
            </div>
            <div>
              <label :class="labelClass">Adresse (facultatif)</label>
              <input v-model="url" :class="fieldClass" type="text" placeholder="https://..." autocomplete="off" />
            </div>
            <div>
              <label :class="labelClass">Mot de passe</label>
              <div class="flex items-center gap-2">
                <div class="relative flex-1">
                  <input
                    v-model="password"
                    :class="fieldClass"
                    :type="showPassword ? 'text' : 'password'"
                    placeholder="Mot de passe"
                    autocomplete="off"
                  />
                  <button
                    class="absolute right-2 top-1/2 grid -translate-y-1/2 place-items-center rounded-md p-1 text-zinc-500 transition hover:text-zinc-200"
                    type="button"
                    :aria-label="showPassword ? 'Masquer' : 'Afficher'"
                    @click="showPassword = !showPassword"
                  >
                    <component :is="showPassword ? EyeOff : Eye" :size="15" />
                  </button>
                </div>
                <button
                  class="grid size-9 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-zinc-300 transition hover:bg-white/[0.08] hover:text-accent-mint"
                  type="button"
                  title="Generer un mot de passe"
                  @click="generatorOpen = true"
                >
                  <RefreshCw :size="15" />
                </button>
              </div>
              <p v-if="loadingSecret" class="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
                <Spinner :size="11" /> Lecture du secret...
              </p>
              <PassStrengthBar v-if="password.length > 0" :password="password" class="mt-2" />
            </div>
            <div>
              <label :class="labelClass">Note (facultatif)</label>
              <textarea
                v-model="notes"
                :class="fieldClass"
                rows="3"
                placeholder="Notes, questions de securite..."
              />
            </div>

            <p v-if="store.error" class="text-xs text-accent-coral">{{ store.error }}</p>
          </div>

          <footer class="flex items-center justify-end gap-2 border-t border-white/[0.05] px-5 py-3.5">
            <button
              class="inline-flex h-9 items-center rounded-md px-3.5 text-sm font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
              type="button"
              @click="emit('close')"
            >
              Annuler
            </button>
            <button
              class="inline-flex h-9 items-center gap-2 rounded-md bg-accent-mint px-3.5 text-sm font-medium text-ink-950 shadow-lift transition hover:bg-[#a5f0ce] disabled:cursor-not-allowed disabled:opacity-45"
              type="button"
              :disabled="!canSave"
              @click="submit"
            >
              <Spinner v-if="store.working" :size="14" />
              <span>{{ isEdit ? 'Enregistrer' : 'Ajouter' }}</span>
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>

  <OmnipassGeneratorDialog
    :open="generatorOpen"
    @close="generatorOpen = false"
    @use="onUsePassword"
  />
</template>

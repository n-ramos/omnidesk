<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Users, X } from 'lucide-vue-next'
import Spinner from '@renderer/components/ui/Spinner.vue'
import { useOmnichatStore } from '@renderer/stores/omnichatStore'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (event: 'close'): void }>()

const omnichat = useOmnichatStore()

const title = ref('')
const joinCode = ref('')

// Reinitialise le formulaire a chaque ouverture.
watch(
  () => props.open,
  (open) => {
    if (open) {
      title.value = ''
      joinCode.value = ''
      omnichat.error = undefined
    }
  },
)

// On ne choisit pas de membres : un groupe se cree (solo possible) puis on partage son
// code, ou l'on rejoint un groupe existant via son code. Pas de liste de membres affichee.
const canCreate = computed(() => title.value.trim().length > 0 && !omnichat.working)

const submit = async (): Promise<void> => {
  if (!canCreate.value) {
    return
  }
  try {
    await omnichat.createGroup(title.value.trim(), [])
    emit('close')
  } catch {
    // L'erreur est exposee via omnichat.error.
  }
}

const join = async (): Promise<void> => {
  const code = joinCode.value.trim()
  if (!code || omnichat.working) {
    return
  }
  try {
    await omnichat.joinGroup(code)
    emit('close')
  } catch {
    // L'erreur est exposee via omnichat.error.
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
        <div class="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900 shadow-lift">
          <header class="flex items-center gap-3 border-b border-white/[0.05] px-5 py-4">
            <span class="grid size-9 place-items-center rounded-xl bg-accent-mint/15 text-accent-mint">
              <Users :size="18" />
            </span>
            <h2 class="flex-1 text-base font-semibold text-white">Creer un groupe</h2>
            <button
              class="grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
              type="button"
              aria-label="Fermer"
              @click="emit('close')"
            >
              <X :size="16" />
            </button>
          </header>

          <div class="space-y-4 px-5 py-4">
            <div>
              <label class="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                Nom du groupe
              </label>
              <input
                v-model="title"
                class="w-full rounded-lg bg-ink-950/55 px-3 py-2 text-sm text-white placeholder-zinc-600 shadow-line outline-none focus:ring-1 focus:ring-accent-mint/40"
                placeholder="Ex. Equipe produit"
                type="text"
                maxlength="160"
                @keydown.enter.prevent="submit"
              />
              <p class="mt-1.5 text-xs leading-5 text-zinc-500">
                Le groupe est cree avec toi seul. Partage ensuite son code (icone lien) pour
                que d'autres le rejoignent.
              </p>
            </div>

            <div class="border-t border-white/[0.05] pt-3">
              <label class="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                Ou rejoindre par code
              </label>
              <div class="flex items-center gap-2 rounded-lg bg-ink-950/55 px-3 py-2 shadow-line">
                <input
                  v-model="joinCode"
                  class="w-full bg-transparent text-sm text-white placeholder-zinc-600 outline-none"
                  placeholder="Code du groupe (partage par un membre)"
                  type="text"
                  @keydown.enter.prevent="join"
                />
                <button
                  class="shrink-0 rounded-md bg-white/[0.06] px-2.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/[0.1] disabled:opacity-30"
                  type="button"
                  :disabled="!joinCode.trim() || omnichat.working"
                  @click="join"
                >
                  Rejoindre
                </button>
              </div>
            </div>

            <p v-if="omnichat.error" class="text-xs text-accent-coral">{{ omnichat.error }}</p>
          </div>

          <footer class="flex items-center justify-end gap-2 border-t border-white/[0.05] px-5 py-3.5">
            <button
              class="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
              type="button"
              @click="emit('close')"
            >
              Annuler
            </button>
            <button
              class="inline-flex items-center gap-2 rounded-lg bg-accent-mint px-4 py-2 text-sm font-semibold text-ink-950 transition hover:brightness-110 disabled:opacity-40"
              type="button"
              :disabled="!canCreate"
              @click="submit"
            >
              <Spinner v-if="omnichat.working" :size="14" label="Creation" />
              <Users v-else :size="15" />
              Creer le groupe
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

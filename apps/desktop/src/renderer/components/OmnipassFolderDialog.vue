<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FolderPlus, X } from 'lucide-vue-next'
import Spinner from '@renderer/components/ui/Spinner.vue'
import { useOmnipassStore } from '@renderer/stores/omnipassStore'
import type { PassFolderSummary } from '@shared/models'

const props = defineProps<{ open: boolean; folder: PassFolderSummary | null }>()
const emit = defineEmits<{ (event: 'close'): void }>()

const store = useOmnipassStore()
const name = ref('')

const isEdit = computed(() => props.folder !== null)
const canSave = computed(() => name.value.trim().length > 0 && !store.working)

watch(
  () => props.open,
  (open) => {
    if (!open) {
      return
    }
    store.error = undefined
    name.value = props.folder?.name ?? ''
  },
)

const submit = async (): Promise<void> => {
  if (!canSave.value) {
    return
  }
  try {
    if (props.folder) {
      await store.renameFolder(props.folder.id, name.value.trim())
    } else {
      // Cree dans le dossier actuellement selectionne (racine si "Tout").
      await store.createFolder({ name: name.value.trim(), parentId: store.selectedFolderId })
    }
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
          class="w-full max-w-sm overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900 shadow-lift"
        >
          <header class="flex items-center gap-3 border-b border-white/[0.05] px-5 py-4">
            <span class="grid size-9 place-items-center rounded-xl bg-accent-mint/15 text-accent-mint">
              <FolderPlus :size="18" />
            </span>
            <h2 class="flex-1 text-base font-semibold text-white">
              {{ isEdit ? 'Renommer le dossier' : 'Nouveau dossier' }}
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

          <div class="space-y-3 px-5 py-4">
            <input
              v-model="name"
              class="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-accent-mint/50 focus:bg-white/[0.06]"
              type="text"
              placeholder="Nom du dossier"
              @keyup.enter="submit"
            />
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
              <span>{{ isEdit ? 'Renommer' : 'Creer' }}</span>
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

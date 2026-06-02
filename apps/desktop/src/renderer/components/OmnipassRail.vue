<script setup lang="ts">
import { ref } from 'vue'
import { FolderPlus, KeyRound, ListTree, Lock, Search, Star } from 'lucide-vue-next'
import StatusBadge from '@renderer/components/ui/StatusBadge.vue'
import PassFolderTree from '@renderer/components/PassFolderTree.vue'
import OmnipassFolderDialog from '@renderer/components/OmnipassFolderDialog.vue'
import { useOmnipassStore } from '@renderer/stores/omnipassStore'
import type { PassFolderSummary } from '@shared/models'

const store = useOmnipassStore()
const folderDialogOpen = ref(false)
const editingFolder = ref<PassFolderSummary | null>(null)
const rootDropActive = ref(false)

const openCreateFolder = (): void => {
  editingFolder.value = null
  folderDialogOpen.value = true
}

const openRenameFolder = (folder: PassFolderSummary): void => {
  editingFolder.value = folder
  folderDialogOpen.value = true
}

// Depot sur "Tout" = sortir l'element a la racine (entree -> sans dossier ; dossier -> niveau racine).
const onDropRoot = (event: DragEvent): void => {
  rootDropActive.value = false
  const entryId = event.dataTransfer?.getData('application/x-omnipass-entry')
  if (entryId) {
    void store.moveEntry(entryId, null)
    return
  }
  const folderId = event.dataTransfer?.getData('application/x-omnipass-folder')
  if (folderId) {
    void store.moveFolder(folderId, null)
  }
}
</script>

<template>
  <aside class="flex min-w-0 flex-col border-y border-r border-white/[0.04] bg-ink-900/95">
    <header class="flex shrink-0 items-center gap-3 border-b border-white/[0.04] px-4 py-3.5">
      <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-mint/15 text-accent-mint">
        <KeyRound :size="18" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold text-white">Omnipass</p>
        <p class="truncate text-[11px] text-zinc-500">Coffre de mots de passe</p>
      </div>
      <StatusBadge :tone="store.isUnlocked ? 'success' : 'neutral'">
        {{ store.isUnlocked ? 'Ouvert' : 'Verrouille' }}
      </StatusBadge>
    </header>

    <div v-if="store.isUnlocked" class="flex min-h-0 flex-1 flex-col">
      <div class="p-3 pb-2">
        <div class="relative">
          <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            v-model="store.query"
            class="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-accent-mint/50"
            type="text"
            placeholder="Rechercher..."
          />
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <button
          class="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition"
          :class="[
            store.view === 'all' && store.selectedFolderId === null
              ? 'bg-accent-mint/12 text-accent-mint'
              : 'text-zinc-300 hover:bg-white/[0.05]',
            rootDropActive ? 'ring-1 ring-accent-mint/50' : '',
          ]"
          type="button"
          @click="store.selectFolder(null)"
          @dragover.prevent="rootDropActive = true"
          @dragleave="rootDropActive = false"
          @drop.prevent="onDropRoot"
        >
          <ListTree :size="14" class="shrink-0" />
          <span class="truncate">Tout</span>
          <span class="ml-auto text-[11px] text-zinc-600">{{ store.entries.length }}</span>
        </button>
        <button
          class="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition"
          :class="
            store.view === 'favorites'
              ? 'bg-accent-mint/12 text-accent-mint'
              : 'text-zinc-300 hover:bg-white/[0.05]'
          "
          type="button"
          @click="store.selectFavorites()"
        >
          <Star :size="14" class="shrink-0" />
          <span class="truncate">Favoris</span>
        </button>

        <PassFolderTree :nodes="store.folderTree" @rename="openRenameFolder" />
      </div>

      <div class="flex flex-col gap-2 border-t border-white/[0.04] p-3">
        <button
          class="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-white/[0.055] text-sm font-medium text-zinc-100 shadow-line transition hover:bg-white/[0.085]"
          type="button"
          @click="openCreateFolder"
        >
          <FolderPlus :size="15" />
          <span>Nouveau dossier</span>
        </button>
        <button
          class="inline-flex h-9 items-center justify-center gap-2 rounded-md text-sm font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
          type="button"
          @click="store.lock()"
        >
          <Lock :size="15" />
          <span>Verrouiller le coffre</span>
        </button>
      </div>
    </div>

    <div
      v-else
      class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center"
    >
      <Lock :size="22" class="text-zinc-600" />
      <p class="text-xs text-zinc-500">
        Coffre verrouille. Saisissez le mot de passe maitre pour acceder a vos entrees.
      </p>
    </div>

    <OmnipassFolderDialog
      :open="folderDialogOpen"
      :folder="editingFolder"
      @close="folderDialogOpen = false"
    />
  </aside>
</template>

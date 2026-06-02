<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ChevronDown, ChevronRight, Folder, FolderOpen, Pencil, Trash2 } from 'lucide-vue-next'
import { confirm } from '@renderer/composables/useConfirm'
import { useOmnipassStore } from '@renderer/stores/omnipassStore'
import type { PassFolderNode } from '@renderer/stores/omnipassStore'

// Composant RECURSIF : se reference lui-meme (par son nom de fichier) pour rendre les sous-dossiers.
const props = withDefaults(defineProps<{ nodes: PassFolderNode[]; depth?: number }>(), { depth: 0 })
const emit = defineEmits<{ (event: 'rename', node: PassFolderNode): void }>()

const store = useOmnipassStore()
const collapsed = reactive<Record<string, boolean>>({})
const dropTargetId = ref<string | null>(null)
const dropMode = ref<'before' | 'after' | 'inside' | null>(null)

const toggle = (id: string): void => {
  collapsed[id] = !collapsed[id]
}

const onDragStart = (event: DragEvent, id: string): void => {
  event.dataTransfer?.setData('application/x-omnipass-folder', id)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

// Zone de depot selon la position verticale du curseur : haut = avant, bas = apres, centre = imbriquer.
const onDragOver = (event: DragEvent, nodeId: string): void => {
  const el = event.currentTarget as HTMLElement | null
  if (!el) {
    return
  }
  const rect = el.getBoundingClientRect()
  const ratio = (event.clientY - rect.top) / rect.height
  dropMode.value = ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'inside'
  dropTargetId.value = nodeId
}

const onDragLeave = (nodeId: string): void => {
  if (dropTargetId.value === nodeId) {
    dropTargetId.value = null
    dropMode.value = null
  }
}

const onDrop = (event: DragEvent, node: PassFolderNode): void => {
  const mode = dropMode.value
  dropTargetId.value = null
  dropMode.value = null

  // Une entree deposee est rangee dans ce dossier (peu importe la zone).
  const entryId = event.dataTransfer?.getData('application/x-omnipass-entry')
  if (entryId) {
    void store.moveEntry(entryId, node.id)
    return
  }

  const movedId = event.dataTransfer?.getData('application/x-omnipass-folder')
  if (!movedId || movedId === node.id) {
    return
  }
  if (mode === 'inside' || mode === null) {
    void store.moveFolder(movedId, node.id)
    return
  }
  // before/after : reordonner parmi les freres de ce niveau (meme parent).
  const siblingIds = props.nodes.map((sibling) => sibling.id)
  const fromIndex = siblingIds.indexOf(movedId)
  if (fromIndex === -1) {
    // Le dossier vient d'un autre niveau -> il devient frere de ce niveau (a la fin).
    void store.moveFolder(movedId, node.parentId)
    return
  }
  siblingIds.splice(fromIndex, 1)
  let insertAt = siblingIds.indexOf(node.id)
  if (mode === 'after') {
    insertAt += 1
  }
  siblingIds.splice(insertAt, 0, movedId)
  void store.reorderFolders(node.parentId, siblingIds)
}

const isSelected = (node: PassFolderNode): boolean =>
  store.view === 'all' && store.selectedFolderId === node.id

const remove = async (node: PassFolderNode): Promise<void> => {
  const ok = await confirm({
    title: `Supprimer le dossier ${node.name} ?`,
    message: 'Son contenu (entrees et sous-dossiers) sera deplace vers le dossier parent.',
    confirmLabel: 'Supprimer',
    tone: 'danger',
  })
  if (ok) {
    void store.deleteFolder(node.id)
  }
}
</script>

<template>
  <div>
    <div v-for="node in nodes" :key="node.id">
      <div
        class="group flex items-center gap-1 rounded-lg pr-1 transition"
        :class="[
          isSelected(node) ? 'bg-accent-mint/12 text-accent-mint' : 'text-zinc-300 hover:bg-white/[0.05]',
          dropTargetId === node.id && dropMode === 'inside' ? 'ring-1 ring-accent-mint/50' : '',
          dropTargetId === node.id && dropMode === 'before' ? 'shadow-[inset_0_2px_0_0_#8ee6bf]' : '',
          dropTargetId === node.id && dropMode === 'after' ? 'shadow-[inset_0_-2px_0_0_#8ee6bf]' : '',
        ]"
        :style="{ paddingLeft: `${depth * 14 + 4}px` }"
        draggable="true"
        @dragstart.stop="onDragStart($event, node.id)"
        @dragover.prevent="onDragOver($event, node.id)"
        @dragleave="onDragLeave(node.id)"
        @drop.prevent="onDrop($event, node)"
      >
        <button
          class="grid size-5 shrink-0 place-items-center rounded text-zinc-500 transition hover:text-zinc-200 disabled:opacity-0"
          type="button"
          :disabled="node.children.length === 0"
          @click.stop="toggle(node.id)"
        >
          <component :is="collapsed[node.id] ? ChevronRight : ChevronDown" :size="13" />
        </button>
        <button
          class="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-sm"
          type="button"
          @click="store.selectFolder(node.id)"
        >
          <component :is="isSelected(node) ? FolderOpen : Folder" :size="14" class="shrink-0" />
          <span class="truncate">{{ node.name }}</span>
        </button>
        <button
          class="grid size-5 shrink-0 place-items-center rounded text-zinc-600 opacity-0 transition hover:text-zinc-200 group-hover:opacity-100"
          type="button"
          title="Renommer"
          @click.stop="emit('rename', node)"
        >
          <Pencil :size="11" />
        </button>
        <button
          class="grid size-5 shrink-0 place-items-center rounded text-zinc-600 opacity-0 transition hover:text-accent-coral group-hover:opacity-100"
          type="button"
          title="Supprimer"
          @click.stop="remove(node)"
        >
          <Trash2 :size="11" />
        </button>
      </div>
      <PassFolderTree
        v-if="node.children.length > 0 && !collapsed[node.id]"
        :nodes="node.children"
        :depth="depth + 1"
        @rename="emit('rename', $event)"
      />
    </div>
  </div>
</template>

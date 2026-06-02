<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { Globe, Pencil, Volume2, VolumeX, X } from 'lucide-vue-next'
import { useBrowserStore, type BrowserTabView } from '@renderer/stores/browserStore'

const props = defineProps<{ tab: BrowserTabView }>()
const store = useBrowserStore()

const editing = ref(false)
const draft = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

const onDragStart = (event: DragEvent): void => {
  event.dataTransfer?.setData('application/x-omnibrowser-tab', props.tab.id)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

const startRename = async (): Promise<void> => {
  // Pre-rempli avec le surnom existant, sinon le titre de page courant.
  draft.value = props.tab.customTitle ?? props.tab.title ?? ''
  editing.value = true
  await nextTick()
  renameInput.value?.focus()
  renameInput.value?.select()
}

// Enter ou perte de focus : on enregistre. Le garde evite la double-execution Echap -> blur.
const commitRename = (): void => {
  if (!editing.value) {
    return
  }
  editing.value = false
  void store.renameTab(props.tab.id, draft.value)
}

const cancelRename = (): void => {
  editing.value = false
}
</script>

<template>
  <div
    :draggable="!editing"
    class="group flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition"
    :class="
      tab.id === store.activeTabId
        ? 'bg-white/[0.1] text-zinc-100'
        : 'text-zinc-400 hover:bg-white/[0.05]'
    "
    @click="!editing && store.activateTab(tab.id)"
    @dragstart="onDragStart"
  >
    <img
      v-if="tab.faviconUrl"
      :src="tab.faviconUrl"
      alt=""
      referrerpolicy="no-referrer"
      class="size-4 shrink-0 rounded-sm object-contain"
    />
    <Globe v-else :size="14" class="shrink-0 text-zinc-500" />
    <input
      v-if="editing"
      ref="renameInput"
      v-model="draft"
      type="text"
      maxlength="120"
      class="min-w-0 flex-1 rounded bg-ink-950/80 px-1.5 py-0.5 text-sm text-white outline-none shadow-line"
      @click.stop
      @keydown.enter.prevent="commitRename"
      @keydown.esc.prevent="cancelRename"
      @blur="commitRename"
    />
    <span
      v-else
      class="min-w-0 flex-1 truncate"
      title="Double-cliquez pour renommer"
      @dblclick.stop="startRename"
    >{{ tab.customTitle || tab.title || tab.url || 'Nouvel onglet' }}</span>
    <button
      v-if="tab.audible"
      type="button"
      class="grid size-5 shrink-0 place-items-center rounded text-accent-mint transition hover:bg-white/[0.1]"
      :title="tab.muted ? 'Réactiver le son' : 'Couper le son'"
      @click.stop="store.toggleMuteTab(tab.id)"
    >
      <component :is="tab.muted ? VolumeX : Volume2" :size="12" />
    </button>
    <button
      v-if="!editing"
      type="button"
      class="grid size-5 shrink-0 place-items-center rounded text-zinc-500 opacity-0 transition hover:bg-white/[0.1] hover:text-zinc-200 group-hover:opacity-100"
      title="Renommer l'onglet"
      @click.stop="startRename"
    >
      <Pencil :size="11" />
    </button>
    <button
      v-if="!editing"
      type="button"
      class="grid size-5 shrink-0 place-items-center rounded text-zinc-500 opacity-0 transition hover:bg-white/[0.1] hover:text-zinc-200 group-hover:opacity-100"
      title="Fermer l'onglet"
      @click.stop="store.closeTab(tab.id)"
    >
      <X :size="12" />
    </button>
  </div>
</template>

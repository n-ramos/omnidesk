<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  ChevronRight,
  Eye,
  EyeOff,
  FolderInput,
  Trash2,
} from 'lucide-vue-next'
import { useAppStore } from '@renderer/stores/appStore'
import type { MailFolderSummary } from '@shared/models'

interface Props {
  x: number
  y: number
  conversationId: string
  isUnread: boolean
  currentFolderPath?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{ (event: 'close'): void }>()

const store = useAppStore()
const submenuOpen = ref(false)

const account = computed(() => store.activeAccount)
const folders = computed<MailFolderSummary[]>(() =>
  account.value ? store.imapFolders[account.value.id] ?? [] : [],
)

const folderRoleLabel: Record<string, string> = {
  inbox: 'Boite de reception',
  sent: 'Envoyes',
  drafts: 'Brouillons',
  trash: 'Corbeille',
  junk: 'Indesirables',
  archive: 'Archives',
  flagged: 'Suivis',
  all: 'Tous les messages',
  other: '',
}

const folderDisplayName = (folder: MailFolderSummary): string => {
  if (folder.role === 'other') return folder.name
  return folderRoleLabel[folder.role] ?? folder.name
}

const targetFolders = computed<MailFolderSummary[]>(() =>
  folders.value.filter((folder) => folder.path !== props.currentFolderPath),
)

const onToggleRead = async (): Promise<void> => {
  await store.markImapConversationUnread(props.conversationId, props.isUnread)
  emit('close')
}

const onDelete = async (): Promise<void> => {
  await store.deleteImapConversation(props.conversationId)
  emit('close')
}

const onMove = async (folder: MailFolderSummary): Promise<void> => {
  await store.moveImapConversation(props.conversationId, folder.path)
  emit('close')
}

const onGlobalClick = (event: MouseEvent): void => {
  const target = event.target as HTMLElement | null
  if (!target) return
  if (target.closest('[data-mail-context-menu]')) return
  emit('close')
}

const onEscape = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  window.addEventListener('mousedown', onGlobalClick)
  window.addEventListener('keydown', onEscape)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onGlobalClick)
  window.removeEventListener('keydown', onEscape)
})

const menuStyle = computed(() => {
  const maxX = window.innerWidth - 240
  const maxY = window.innerHeight - 200
  return {
    top: `${Math.min(props.y, maxY)}px`,
    left: `${Math.min(props.x, maxX)}px`,
  }
})
</script>

<template>
  <div
    data-mail-context-menu
    class="fixed z-50 min-w-[220px] rounded-xl border border-white/[0.08] bg-ink-925 p-1.5 shadow-lift"
    :style="menuStyle"
  >
    <button
      class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-zinc-200 transition hover:bg-white/[0.06]"
      type="button"
      @click="onToggleRead"
    >
      <component :is="isUnread ? Eye : EyeOff" :size="14" class="text-zinc-400" />
      {{ isUnread ? 'Marquer comme lu' : 'Marquer comme non lu' }}
    </button>

    <div
      class="relative"
      @mouseenter="submenuOpen = true"
      @mouseleave="submenuOpen = false"
    >
      <button
        class="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-zinc-200 transition hover:bg-white/[0.06]"
        type="button"
      >
        <span class="flex items-center gap-2">
          <FolderInput :size="14" class="text-zinc-400" />
          Deplacer vers
        </span>
        <ChevronRight :size="14" class="text-zinc-500" />
      </button>

      <div
        v-if="submenuOpen && targetFolders.length > 0"
        class="absolute left-full top-0 ml-1 min-w-[200px] rounded-xl border border-white/[0.08] bg-ink-925 p-1.5 shadow-lift"
        data-mail-context-menu
      >
        <button
          v-for="folder in targetFolders"
          :key="folder.path"
          class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-zinc-200 transition hover:bg-white/[0.06]"
          type="button"
          @click="onMove(folder)"
        >
          {{ folderDisplayName(folder) }}
        </button>
      </div>
    </div>

    <div class="my-1 h-px bg-white/[0.06]" />

    <button
      class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-accent-coral transition hover:bg-accent-coral/15"
      type="button"
      @click="onDelete"
    >
      <Trash2 :size="14" />
      Supprimer
    </button>
  </div>
</template>

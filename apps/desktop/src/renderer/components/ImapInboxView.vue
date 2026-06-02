<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Inbox, Pencil, RefreshCw, Search } from 'lucide-vue-next'
import BaseButton from '@renderer/components/ui/BaseButton.vue'
import MailContextMenu from '@renderer/components/MailContextMenu.vue'
import Spinner from '@renderer/components/ui/Spinner.vue'
import { useAppStore } from '@renderer/stores/appStore'
import type { ConversationSummary, MailFolderRole } from '@shared/models'

const store = useAppStore()

const account = computed(() => store.activeAccount)
const conversations = computed<ConversationSummary[]>(() =>
  account.value
    ? store.conversations.filter((entry) => entry.accountId === account.value!.id)
    : [],
)

const selectedFolder = computed(() => {
  if (!account.value) return undefined
  const path = account.value.settings?.selectedFolder
  const folders = store.imapFolders[account.value.id] ?? []
  const match = folders.find((entry) => entry.path === (typeof path === 'string' ? path : 'INBOX'))
  return match
})

const folderLabel = computed(() => {
  const labels: Record<MailFolderRole, string> = {
    inbox: 'Boite de reception',
    sent: 'Envoyes',
    drafts: 'Brouillons',
    trash: 'Corbeille',
    junk: 'Indesirables',
    archive: 'Archives',
    flagged: 'Suivis',
    all: 'Tous les messages',
    other: selectedFolder.value?.name ?? 'Dossier',
  }
  return selectedFolder.value ? labels[selectedFolder.value.role] : 'Boite de reception'
})

const localSearch = ref('')

watch(
  () => account.value?.id,
  () => {
    localSearch.value = ''
  },
)

const filteredConversations = computed<ConversationSummary[]>(() => {
  const query = localSearch.value.trim().toLowerCase()
  if (!query) {
    return conversations.value
  }
  return conversations.value.filter((entry) => {
    const haystack = `${entry.title} ${entry.subject ?? ''} ${entry.lastMessagePreview ?? ''}`.toLowerCase()
    return haystack.includes(query)
  })
})

const sortedConversations = computed<ConversationSummary[]>(() =>
  [...filteredConversations.value].sort((left, right) =>
    (right.lastMessageAt ?? '').localeCompare(left.lastMessageAt ?? ''),
  ),
)

const refresh = (): void => {
  if (account.value) {
    void store.refreshAccount(account.value.id)
  }
}

const senderLabel = (conversation: ConversationSummary): string => {
  if (conversation.lastDirection === 'outgoing') {
    return 'Moi'
  }
  const name = conversation.lastSenderName?.trim()
  const address = conversation.lastSenderAddress?.trim()
  if (name && address && name !== address) {
    return `${name} <${address}>`
  }
  return name || address || 'Expediteur inconnu'
}

const formatDate = (value?: string): string => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(
    [],
    sameYear ? { day: '2-digit', month: 'short' } : { day: '2-digit', month: '2-digit', year: '2-digit' },
  )
}

const openConversation = (id: string): void => {
  void store.selectConversation(id)
}

const onCompose = (): void => {
  store.openCompose()
}

interface ContextTarget {
  x: number
  y: number
  conversationId: string
  isUnread: boolean
}

const contextTarget = ref<ContextTarget | undefined>(undefined)

const openContextMenu = (event: MouseEvent, conversation: ConversationSummary): void => {
  event.preventDefault()
  contextTarget.value = {
    x: event.clientX,
    y: event.clientY,
    conversationId: conversation.id,
    isUnread: conversation.unreadCount > 0,
  }
}

const closeContextMenu = (): void => {
  contextTarget.value = undefined
}

const currentFolderPath = computed<string>(() => {
  const path = account.value?.settings?.selectedFolder
  return typeof path === 'string' && path.length > 0 ? path : 'INBOX'
})

const onScroll = (event: Event): void => {
  if (!account.value) return
  if (store.imapLoadingMoreFor === account.value.id) return
  const target = event.target as HTMLElement
  const remaining = target.scrollHeight - (target.scrollTop + target.clientHeight)
  if (remaining < 220) {
    void store.loadMoreImapMessages()
  }
}

onMounted(() => {
  if (account.value) {
    void store.loadImapFolders(account.value.id)
    if (store.conversations.length === 0) {
      void store.refreshConversations()
    }
  }
})
</script>

<template>
  <section class="flex h-full min-w-0 flex-col bg-ink-925/40">
    <header class="flex shrink-0 items-center gap-3 border-b border-white/[0.04] px-5 py-3">
      <div class="grid size-9 place-items-center rounded-lg bg-white/[0.06] text-zinc-300">
        <Inbox :size="16" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-base font-semibold text-white">{{ folderLabel }}</p>
        <p class="truncate text-xs text-zinc-500">
          {{ sortedConversations.length }} conversation{{ sortedConversations.length > 1 ? 's' : '' }}
          <span v-if="selectedFolder?.totalCount">
            · {{ selectedFolder.totalCount }} message{{ (selectedFolder.totalCount ?? 0) > 1 ? 's' : '' }}
          </span>
        </p>
      </div>
      <BaseButton variant="ghost" type="button" @click="onCompose">
        <Pencil :size="14" />
        Nouveau
      </BaseButton>
      <button
        class="grid size-9 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
        :disabled="store.isWorking"
        title="Synchroniser"
        type="button"
        @click="refresh"
      >
        <Spinner v-if="store.isWorking" :size="16" label="Synchronisation" />
        <RefreshCw v-else :size="16" />
      </button>
    </header>

    <div class="shrink-0 border-b border-white/[0.04] px-5 py-3">
      <label class="flex items-center gap-2 rounded-lg bg-ink-950/55 px-3 py-2 shadow-line">
        <Search :size="14" class="text-zinc-500" />
        <input
          v-model="localSearch"
          class="w-full bg-transparent text-sm text-white placeholder-zinc-600 outline-none"
          placeholder="Rechercher dans ce dossier"
          type="search"
        />
      </label>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto" @scroll.passive="onScroll">
      <div
        v-if="account && store.imapFolderSwitchingFor === account.id"
        class="flex flex-col items-center gap-3 px-6 py-16 text-sm text-zinc-400"
      >
        <Spinner :size="22" label="Chargement du dossier" />
        <span class="text-xs uppercase tracking-[0.18em] text-zinc-500">
          Chargement de {{ folderLabel }}...
        </span>
      </div>

      <p
        v-else-if="sortedConversations.length === 0"
        class="px-6 py-12 text-center text-sm text-zinc-500"
      >
        {{
          localSearch
            ? "Aucun message ne correspond a cette recherche."
            : "Aucun message dans ce dossier."
        }}
      </p>

      <ul
        v-if="!(account && store.imapFolderSwitchingFor === account.id)"
        class="divide-y divide-white/[0.04]"
      >
        <li
          v-for="conversation in sortedConversations"
          :key="conversation.id"
          class="cursor-pointer px-5 py-3 transition"
          :class="
            conversation.unreadCount > 0
              ? 'bg-white/[0.025] hover:bg-white/[0.06]'
              : 'hover:bg-white/[0.04]'
          "
          @click="openConversation(conversation.id)"
          @contextmenu="openContextMenu($event, conversation)"
        >
          <div class="flex items-start gap-3">
            <span
              class="mt-1.5 size-2 shrink-0 rounded-full"
              :class="conversation.unreadCount > 0 ? 'bg-accent-mint' : 'bg-transparent'"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline gap-3">
                <span
                  class="min-w-0 flex-1 truncate text-sm"
                  :class="conversation.unreadCount > 0 ? 'font-semibold text-white' : 'text-zinc-200'"
                >
                  {{ senderLabel(conversation) }}
                </span>
                <span class="shrink-0 text-[11px] tabular-nums text-zinc-500">
                  {{ formatDate(conversation.lastMessageAt) }}
                </span>
              </div>
              <p
                class="mt-0.5 truncate text-sm"
                :class="conversation.unreadCount > 0 ? 'font-medium text-zinc-100' : 'text-zinc-300'"
              >
                {{ conversation.title }}
              </p>
              <p class="mt-1 line-clamp-2 text-xs text-zinc-500">
                {{ conversation.lastMessagePreview ?? 'Sans apercu' }}
              </p>
            </div>
          </div>
        </li>
      </ul>

      <div
        v-if="account && store.imapLoadingMoreFor === account.id"
        class="flex items-center justify-center gap-2 px-6 py-4 text-xs text-zinc-500"
      >
        <Spinner :size="14" label="Chargement" />
        <span>Chargement de plus anciens messages...</span>
      </div>
    </div>

    <MailContextMenu
      v-if="contextTarget"
      :x="contextTarget.x"
      :y="contextTarget.y"
      :conversation-id="contextTarget.conversationId"
      :is-unread="contextTarget.isUnread"
      :current-folder-path="currentFolderPath"
      @close="closeContextMenu"
    />
  </section>
</template>

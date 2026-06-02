<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Archive,
  Files,
  FileText,
  Hash,
  Inbox,
  MessageSquarePlus,
  Pencil,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Star,
  Trash2,
  UserRound,
  Users,
  UserSearch,
} from 'lucide-vue-next'
import ProviderLogo from '@renderer/components/ui/ProviderLogo.vue'
import Spinner from '@renderer/components/ui/Spinner.vue'
import { useAppStore } from '@renderer/stores/appStore'
import type { ConversationKind, MailFolderRole, MailFolderSummary } from '@shared/models'
import { unicodeFromSlackShortcode } from '@shared/slackEmoji'

const SHORTCODE_PATTERN = /:([a-z0-9_+-]+):/g

const renderPreview = (value?: string): string => {
  if (!value) {
    return 'Aucun apercu'
  }

  return value.replace(SHORTCODE_PATTERN, (match, name: string) => {
    return unicodeFromSlackShortcode(name) ?? match
  })
}

const formatBadge = (count: number): string => (count > 99 ? '99+' : String(count))

const store = useAppStore()

const faviconFor = (target: { settings?: Record<string, unknown> }): string | undefined => {
  const value = target.settings?.faviconUrl
  return typeof value === 'string' ? value : undefined
}

const groups = computed(() => store.conversationsByKind)
const account = computed(() => store.activeAccount)
const isImap = computed(() => account.value?.providerId === 'imap')
const folders = computed<MailFolderSummary[]>(() =>
  account.value ? store.imapFolders[account.value.id] ?? [] : [],
)
const selectedFolderPath = computed<string>(() => {
  const value = account.value?.settings?.selectedFolder
  return typeof value === 'string' && value.length > 0 ? value : 'INBOX'
})
const contactQuery = ref('')
const showContacts = ref(false)

watch(
  () => account.value?.id,
  (accountId) => {
    contactQuery.value = ''
    showContacts.value = false
    if (!accountId) {
      return
    }
    if (isImap.value) {
      void store.loadImapFolders(accountId)
    } else {
      void store.loadContactsFor(accountId)
    }
  },
  { immediate: true },
)

const filteredContacts = computed(() => {
  const query = contactQuery.value.trim().toLowerCase()
  const contacts = store.contacts
  if (!query) {
    return contacts.slice(0, 30)
  }

  return contacts
    .filter((contact) => {
      const haystack = `${contact.displayName} ${contact.email ?? ''}`.toLowerCase()
      return haystack.includes(query)
    })
    .slice(0, 30)
})

const kindIcon = (kind: ConversationKind | 'other') => {
  switch (kind) {
    case 'channel':
      return Hash
    case 'dm':
      return UserRound
    case 'group':
      return Users
    default:
      return Inbox
  }
}

const folderRoleIcon = (role: MailFolderRole) => {
  switch (role) {
    case 'inbox':
      return Inbox
    case 'sent':
      return Send
    case 'drafts':
      return FileText
    case 'trash':
      return Trash2
    case 'junk':
      return ShieldAlert
    case 'archive':
      return Archive
    case 'flagged':
      return Star
    case 'all':
      return Files
    default:
      return Files
  }
}

const folderRoleLabel: Record<MailFolderRole, string> = {
  inbox: 'Boite de reception',
  sent: 'Envoyes',
  drafts: 'Brouillons',
  trash: 'Corbeille',
  junk: 'Indesirables',
  archive: 'Archives',
  flagged: 'Suivis',
  all: 'Tous les messages',
  other: 'Dossier',
}

const folderDisplayName = (folder: MailFolderSummary): string => {
  if (folder.role !== 'other') {
    return folderRoleLabel[folder.role]
  }
  return folder.name
}

const selectFolder = async (folder: MailFolderSummary): Promise<void> => {
  if (!account.value) return
  if (folder.path === selectedFolderPath.value) return
  if (store.imapFolderSwitchingFor) return
  await store.selectImapFolder(account.value.id, folder.path)
}

const openCompose = (): void => {
  store.openCompose()
}

const refresh = (): void => {
  if (account.value) {
    void store.refreshAccount(account.value.id)
  }
}

const initialOf = (contact: { displayName: string }): string => {
  const cleaned = contact.displayName.replace(/^@/, '').trim()
  return cleaned.slice(0, 1).toUpperCase() || '?'
}

const startDirectMessage = async (contactExternalId: string): Promise<void> => {
  if (!account.value) {
    return
  }

  await store.openDirectMessage(account.value.id, contactExternalId)
  showContacts.value = false
  contactQuery.value = ''
}

const formatTime = (value?: string): string => {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()

  return isToday
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
}
</script>

<template>
  <aside class="flex min-w-0 flex-col border-y border-r border-white/[0.04] bg-ink-900/95">
    <header class="flex shrink-0 items-center gap-3 border-b border-white/[0.04] px-4 py-3.5">
      <span
        v-if="account"
        class="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.06]"
      >
        <ProviderLogo
          :provider-id="account.providerId"
          :favicon-url="faviconFor(account)"
          :size="18"
        />
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold text-white">
          {{ account?.label ?? 'Tous les services' }}
        </p>
        <p class="truncate text-xs text-zinc-500">
          {{ account ? `${groups.reduce((sum, group) => sum + group.conversations.length, 0)} conversations` : 'Vue unifiee' }}
        </p>
      </div>
      <button
        v-if="account"
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

    <div class="border-b border-white/[0.04] px-4 py-3">
      <label class="flex items-center gap-2 rounded-lg bg-ink-950/55 px-3 py-2 shadow-line">
        <Search :size="14" class="text-zinc-500" />
        <input
          v-model="store.searchQuery"
          class="w-full bg-transparent text-sm text-white placeholder-zinc-600 outline-none"
          placeholder="Rechercher dans les conversations"
          type="search"
          @input="store.refreshConversations()"
        />
      </label>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-2 py-3">
      <section
        v-if="isImap && account"
        class="mb-4 last:mb-0"
      >
        <div class="mb-1.5 flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
          <Inbox :size="12" />
          <span>Dossiers</span>
          <Spinner
            v-if="store.imapFoldersLoadingFor === account.id"
            :size="11"
            label="Chargement des dossiers"
            class="ml-auto text-zinc-500"
          />
        </div>
        <p
          v-if="folders.length === 0 && store.imapFoldersLoadingFor !== account.id"
          class="px-3 py-2 text-xs text-zinc-500"
        >
          Aucun dossier detecte.
        </p>
        <div class="space-y-0.5">
          <button
            v-for="folder in folders"
            :key="folder.path"
            class="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition disabled:cursor-wait disabled:opacity-60"
            :class="
              folder.path === selectedFolderPath
                ? 'bg-accent-mint/15 text-white'
                : 'text-zinc-300 hover:bg-white/[0.05]'
            "
            type="button"
            :disabled="!!store.imapFolderSwitchingFor && folder.path !== selectedFolderPath"
            @click="selectFolder(folder)"
          >
            <Spinner
              v-if="store.imapFolderSwitchingFor === account?.id && folder.path === selectedFolderPath"
              :size="14"
              label="Chargement"
              class="shrink-0 text-accent-mint"
            />
            <component :is="folderRoleIcon(folder.role)" v-else :size="14" class="shrink-0 text-zinc-400" />
            <span class="min-w-0 flex-1 truncate">{{ folderDisplayName(folder) }}</span>
            <span
              v-if="folder.unreadCount && folder.unreadCount > 0"
              class="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent-coral px-1.5 text-[10px] font-bold leading-none tabular-nums text-white"
            >
              {{ formatBadge(folder.unreadCount) }}
            </span>
          </button>
        </div>
      </section>

      <p
        v-if="groups.length === 0 && !isImap"
        class="px-3 py-6 text-center text-sm text-zinc-500"
      >
        {{
          account
            ? "Aucune conversation pour le moment. Lancez une synchronisation."
            : 'Choisissez un service dans la barre de gauche.'
        }}
      </p>

      <section
        v-for="group in (isImap ? [] : groups)"
        :key="group.kind"
        class="mb-4 last:mb-0"
      >
        <div class="mb-1.5 flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
          <component :is="kindIcon(group.kind)" :size="12" />
          <span>{{ group.label }}</span>
          <span class="ml-auto text-zinc-600">{{ group.conversations.length }}</span>
        </div>

        <div class="space-y-0.5">
          <button
            v-for="conversation in group.conversations"
            :key="conversation.id"
            class="group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition"
            :class="
              store.selectedConversation?.id === conversation.id
                ? 'bg-accent-mint/15 text-white'
                : 'text-zinc-300 hover:bg-white/[0.05]'
            "
            type="button"
            @click="store.selectConversation(conversation.id)"
          >
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="flex min-w-0 items-center gap-2">
                <span
                  class="min-w-0 flex-1 truncate text-sm"
                  :class="conversation.unreadCount > 0 ? 'font-semibold text-white' : 'font-medium'"
                >
                  {{ conversation.title }}
                </span>
                <Spinner
                  v-if="store.loadingConversationId === conversation.id"
                  :size="12"
                  label="Ouverture"
                  class="shrink-0 text-zinc-300"
                />
                <span
                  v-else
                  class="shrink-0 text-[10px] tabular-nums"
                  :class="conversation.unreadCount > 0 ? 'text-zinc-300' : 'text-zinc-600'"
                >
                  {{ formatTime(conversation.lastMessageAt) }}
                </span>
                <span
                  v-if="conversation.unreadCount > 0 && store.loadingConversationId !== conversation.id"
                  class="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent-coral px-1.5 text-[10px] font-bold leading-none tabular-nums text-white"
                >
                  {{ formatBadge(conversation.unreadCount) }}
                </span>
              </span>
              <span class="mt-0.5 flex min-w-0 items-center">
                <span
                  class="min-w-0 flex-1 truncate text-xs"
                  :class="conversation.unreadCount > 0 ? 'text-zinc-300' : 'text-zinc-500'"
                >
                  {{ renderPreview(conversation.lastMessagePreview) }}
                </span>
              </span>
            </span>
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="isImap && account"
      class="shrink-0 border-t border-white/[0.04] bg-ink-900/95 px-3 py-3"
    >
      <button
        class="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-mint/15 px-3 py-2 text-sm font-semibold text-accent-mint transition hover:bg-accent-mint/25"
        type="button"
        @click="openCompose"
      >
        <Pencil :size="14" />
        Nouveau message
      </button>
    </div>

    <div
      v-else-if="account"
      class="relative shrink-0 border-t border-white/[0.04] bg-ink-900/95 px-3 py-3"
    >
      <div
        v-if="showContacts"
        class="absolute bottom-full left-3 right-3 mb-2 max-h-64 overflow-y-auto rounded-xl border border-white/[0.04] bg-ink-925 p-2 shadow-lift"
      >
        <div
          v-if="store.isLoadingContacts"
          class="flex items-center justify-center gap-2 px-3 py-4 text-xs text-zinc-500"
        >
          <Spinner :size="14" label="Chargement de l'annuaire" />
          <span>Chargement de l'annuaire...</span>
        </div>
        <p
          v-else-if="filteredContacts.length === 0"
          class="px-3 py-4 text-center text-xs text-zinc-500"
        >
          {{ contactQuery ? 'Aucun contact trouve.' : 'Annuaire vide.' }}
        </p>
        <button
          v-for="contact in filteredContacts"
          :key="contact.externalContactId"
          class="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.05]"
          type="button"
          @click="startDirectMessage(contact.externalContactId)"
        >
          <span class="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.08] text-xs font-semibold text-zinc-200">
            {{ initialOf(contact) }}
          </span>
          <span class="min-w-0">
            <span class="block truncate text-sm font-medium text-zinc-100">
              {{ contact.displayName }}
            </span>
            <span v-if="contact.email" class="block truncate text-xs text-zinc-500">
              {{ contact.email }}
            </span>
          </span>
        </button>
      </div>

      <label class="flex items-center gap-2 rounded-lg bg-ink-950/55 px-3 py-2 shadow-line">
        <UserSearch :size="14" class="text-zinc-500" />
        <input
          v-model="contactQuery"
          class="w-full bg-transparent text-sm text-white placeholder-zinc-600 outline-none"
          placeholder="Trouver un contact, lancer un DM"
          type="search"
          @focus="showContacts = true"
        />
        <button
          v-if="showContacts || contactQuery"
          class="text-xs text-zinc-500 hover:text-zinc-200"
          type="button"
          @click="() => { showContacts = false; contactQuery = '' }"
        >
          Fermer
        </button>
        <button
          v-else
          class="grid size-7 place-items-center rounded-md text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
          type="button"
          title="Nouveau message direct"
          @click="showContacts = true"
        >
          <MessageSquarePlus :size="15" />
        </button>
      </label>
    </div>
  </aside>
</template>

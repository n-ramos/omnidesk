<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  ArrowLeft,
  Check,
  Copy,
  FileText,
  Hash,
  Image as ImageIcon,
  LogOut,
  Mail,
  MessageSquareText,
  Paperclip,
  Phone,
  Send,
  UserRound,
  Users,
  X,
} from 'lucide-vue-next'
import BaseButton from '@renderer/components/ui/BaseButton.vue'
import EmojiPickerPopover from '@renderer/components/EmojiPickerPopover.vue'
import MessageAttachments from '@renderer/components/MessageAttachments.vue'
import MessageContent from '@renderer/components/MessageContent.vue'
import MessageReactions from '@renderer/components/MessageReactions.vue'
import Spinner from '@renderer/components/ui/Spinner.vue'
import StatusBadge from '@renderer/components/ui/StatusBadge.vue'
import TenorPickerPopover from '@renderer/components/TenorPickerPopover.vue'
import { useAppStore } from '@renderer/stores/appStore'
import { useOmnichatStore } from '@renderer/stores/omnichatStore'
import { useOmnichat } from '@renderer/composables/useOmnichat'
import { openCallOverlay } from '@renderer/composables/useCallOverlay'
import { confirm } from '@renderer/composables/useConfirm'
import type { MessageSummary, TenorGifResult } from '@shared/models'

const store = useAppStore()
const omnichat = useOmnichat()
const omnichatStore = useOmnichatStore()

const conversation = computed(() => store.selectedConversation)

// Messagerie native omnichat : saisie + accuses de lecture (gates par provider).
const isOmnichat = computed(() => conversation.value?.providerId === 'omnichat')
const typingLabel = computed(() =>
  conversation.value ? omnichatStore.typingByConversation[conversation.value.id] : undefined,
)
const showReadReceipt = computed(
  () =>
    isOmnichat.value
    && conversation.value !== undefined
    && omnichatStore.readByConversation[conversation.value.id] === true
    && conversation.value.messages.at(-1)?.direction === 'outgoing',
)

const onComposerInput = (): void => {
  if (isOmnichat.value && conversation.value) {
    omnichatStore.notifyTyping(conversation.value.id)
  }
}

// Code de groupe omnichat (a partager pour inviter).
const isOmnichatGroup = computed(() => isOmnichat.value && conversation.value?.kind === 'group')
const groupCodeCopied = ref(false)
const copyGroupCode = async (): Promise<void> => {
  const conv = conversation.value
  if (!conv) {
    return
  }
  const ok = await omnichatStore.copyGroupCode(conv.id)
  if (ok) {
    groupCodeCopied.value = true
    setTimeout(() => {
      groupCodeCopied.value = false
    }, 1500)
  }
}

const leaveGroup = async (): Promise<void> => {
  const conv = conversation.value
  if (!conv) {
    return
  }
  const ok = await confirm({
    title: `Quitter ${conv.title} ?`,
    message: 'Tu ne recevras plus les messages de ce groupe et il sera retire de ta liste.',
    confirmLabel: 'Quitter',
    tone: 'danger',
  })
  if (ok) {
    try {
      await omnichatStore.leaveGroup(conv.id)
    } catch {
      // L'erreur est exposee via le store.
    }
  }
}

// Appel ad-hoc (omnichat uniquement) : DM -> on invite le pair ; groupe -> on demarre
// seul puis on ajoute des participants via le bouton + de l'appel (jamais tout le groupe).
const startCall = async (): Promise<void> => {
  const conv = conversation.value
  if (!conv || !isOmnichat.value || omnichat.state.active || omnichat.state.connecting) {
    return
  }
  openCallOverlay()
  await omnichatStore.startCallForConversation({ id: conv.id, kind: conv.kind, title: conv.title })
}

// Roster des membres du groupe ouvert (pseudo + presence), pour "se voir entre membres".
// Les pseudos/etats viennent de peersById (presence a la demande) ; repli sur l'id.
const groupMembers = computed(() => {
  if (!isOmnichatGroup.value || !conversation.value) {
    return []
  }
  const peers = omnichatStore.peersById
  const self = omnichatStore.identity?.id?.toLowerCase()
  return (conversation.value.participants ?? [])
    .map((participant) => participant.address?.toLowerCase())
    .filter((id): id is string => Boolean(id) && id !== self)
    .map((id) => ({ id, pseudo: peers[id]?.pseudo ?? id, online: peers[id]?.online ?? false }))
})

// Presence a la demande : on surveille les membres du groupe ouvert tant qu'il est affiche.
watch(
  () => (isOmnichatGroup.value ? (conversation.value?.id ?? null) : null),
  (groupId) => omnichatStore.watchGroup(groupId),
  { immediate: true },
)
onBeforeUnmount(() => omnichatStore.watchGroup(null))

const MAX_ATTACHMENTS = 10
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

const draft = ref('')
const isSending = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const messagesScrollRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const pendingAttachments = ref<File[]>([])
const attachmentError = ref<string | undefined>(undefined)

const canSend = computed(
  () =>
    !isSending.value
    && (draft.value.trim().length > 0 || pendingAttachments.value.length > 0),
)

watch(
  () => conversation.value?.id,
  () => {
    draft.value = ''
    pendingAttachments.value = []
    attachmentError.value = undefined
    isSending.value = false
    void nextTick(() => {
      scrollMessagesToBottom()
      textareaRef.value?.focus()
    })
  },
)

watch(
  () => conversation.value?.messages.length,
  () => {
    void nextTick(scrollMessagesToBottom)
  },
)

const scrollMessagesToBottom = (): void => {
  const node = messagesScrollRef.value
  if (node) {
    node.scrollTop = node.scrollHeight
  }
}

const send = async (): Promise<void> => {
  if (!canSend.value) {
    return
  }

  const body = draft.value
  const files = [...pendingAttachments.value]
  isSending.value = true
  try {
    await store.sendMessage(body, files)
    draft.value = ''
    pendingAttachments.value = []
    attachmentError.value = undefined
    await nextTick()
    scrollMessagesToBottom()
    textareaRef.value?.focus()
  } catch {
    // L'erreur est deja remontee dans le store.
  } finally {
    isSending.value = false
  }
}

const openFilePicker = (): void => {
  attachmentError.value = undefined
  fileInputRef.value?.click()
}

const onFilesSelected = (event: Event): void => {
  const input = event.target as HTMLInputElement
  const selected = Array.from(input.files ?? [])

  if (selected.length === 0) {
    return
  }

  const oversized = selected.find((file) => file.size > MAX_ATTACHMENT_BYTES)
  if (oversized) {
    attachmentError.value = `${oversized.name} depasse 25 Mo.`
    input.value = ''
    return
  }

  const available = MAX_ATTACHMENTS - pendingAttachments.value.length
  if (available <= 0) {
    attachmentError.value = `Maximum ${MAX_ATTACHMENTS} fichiers par message.`
    input.value = ''
    return
  }

  if (selected.length > available) {
    attachmentError.value = `Seuls les ${available} premiers fichiers ont ete ajoutes.`
  } else {
    attachmentError.value = undefined
  }

  pendingAttachments.value = [...pendingAttachments.value, ...selected.slice(0, available)]
  input.value = ''
}

const removePendingAttachment = (index: number): void => {
  pendingAttachments.value = pendingAttachments.value.filter((_, position) => position !== index)
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} o`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} Ko`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

const isImageAttachment = (file: File): boolean => file.type.startsWith('image/')

const onKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    void send()
  }
}

const isOptimisticId = (id: string): boolean => id.startsWith('optimistic:')

const reactionFeedback = ref<string | undefined>(undefined)
let reactionFeedbackTimer: ReturnType<typeof setTimeout> | undefined

const showReactionFeedback = (message: string): void => {
  reactionFeedback.value = message
  if (reactionFeedbackTimer) {
    clearTimeout(reactionFeedbackTimer)
  }
  reactionFeedbackTimer = setTimeout(() => {
    reactionFeedback.value = undefined
  }, 6000)
}

const onToggleReaction = async (messageId: string, name: string): Promise<void> => {
  if (isOptimisticId(messageId)) {
    return
  }

  try {
    await store.toggleReaction(messageId, name)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'La reaction a echoue.'
    showReactionFeedback(`Reaction "${name}" : ${message}`)
  }
}

const insertEmoji = (emoji: string): void => {
  const textarea = textareaRef.value
  if (!textarea) {
    draft.value = `${draft.value}${emoji}`
    return
  }

  const start = textarea.selectionStart ?? draft.value.length
  const end = textarea.selectionEnd ?? draft.value.length
  draft.value = `${draft.value.slice(0, start)}${emoji}${draft.value.slice(end)}`

  void nextTick(() => {
    const cursor = start + emoji.length
    textarea.focus()
    textarea.setSelectionRange(cursor, cursor)
  })
}

const insertTenorGif = (gif: TenorGifResult): void => {
  const separator = draft.value.length === 0 || /\s$/.test(draft.value) ? '' : ' '
  draft.value = `${draft.value}${separator}${gif.fullUrl}`

  void nextTick(() => {
    const textarea = textareaRef.value
    if (textarea) {
      const cursor = draft.value.length
      textarea.focus()
      textarea.setSelectionRange(cursor, cursor)
    }
  })
}

const displayName = (message: MessageSummary): string => {
  if (message.direction === 'outgoing') {
    return 'Moi'
  }

  return message.senderName || message.senderAddress || 'Inconnu'
}

const avatarInitial = (message: MessageSummary): string => {
  const source = displayName(message)
  const cleaned = source.replace(/^@/, '').trim()
  return cleaned.slice(0, 1).toUpperCase() || '?'
}

const kindIcon = computed(() => {
  switch (conversation.value?.kind) {
    case 'channel':
      return Hash
    case 'dm':
      return UserRound
    case 'group':
      return Users
    case 'mail':
      return Mail
    default:
      return MessageSquareText
  }
})

const isImapConversation = computed(
  () => conversation.value?.providerId === 'imap',
)

const exitConversation = (): void => {
  store.selectedConversation = undefined
  void store.setFocusedConversation(null)
}

const formatTimestamp = (value?: string): string => {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleString([], {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <article class="relative flex h-full min-h-0 flex-col rounded-r-xl border-y border-r border-white/[0.04] bg-ink-950/94">
    <header
      v-if="conversation"
      class="flex h-[68px] shrink-0 items-center justify-between border-b border-white/[0.04] px-5"
    >
      <div class="flex min-w-0 items-center gap-3">
        <button
          v-if="isImapConversation"
          class="grid size-9 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
          title="Revenir a la liste"
          type="button"
          @click="exitConversation"
        >
          <ArrowLeft :size="18" />
        </button>
        <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-zinc-200">
          <component :is="kindIcon" :size="18" />
        </span>
        <div class="min-w-0">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            {{
              conversation.kind === 'mail'
                ? 'Email'
                : conversation.kind === 'dm'
                  ? 'Message direct'
                  : conversation.kind === 'group'
                    ? 'Groupe'
                    : conversation.kind === 'channel'
                      ? 'Canal'
                      : 'Conversation'
            }}
          </p>
          <h2 class="truncate text-lg font-semibold text-white">{{ conversation.title }}</h2>
          <p v-if="isOmnichat && typingLabel" class="truncate text-xs text-accent-mint">
            {{ typingLabel }} ecrit...
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          v-if="isOmnichatGroup"
          class="grid size-9 shrink-0 place-items-center rounded-lg transition"
          :class="
            groupCodeCopied
              ? 'text-accent-mint'
              : 'text-zinc-400 hover:bg-white/[0.06] hover:text-white'
          "
          :title="groupCodeCopied ? 'Code copie' : 'Inviter : copier le code du groupe'"
          type="button"
          @click="copyGroupCode"
        >
          <component :is="groupCodeCopied ? Check : Copy" :size="17" />
        </button>
        <button
          v-if="isOmnichatGroup"
          class="grid size-9 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-accent-coral/15 hover:text-accent-coral"
          title="Quitter le groupe"
          type="button"
          @click="leaveGroup"
        >
          <LogOut :size="17" />
        </button>
        <button
          v-if="isOmnichat"
          class="grid size-9 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-accent-mint/15 hover:text-accent-mint"
          title="Demarrer un appel omnichat"
          type="button"
          @click="startCall"
        >
          <Phone :size="18" />
        </button>
        <StatusBadge tone="neutral">
          {{ conversation.messages.length }} messages
        </StatusBadge>
        <StatusBadge v-if="conversation.unreadCount > 0" tone="info">
          {{ conversation.unreadCount }} non lus
        </StatusBadge>
      </div>
    </header>

    <!-- Roster du groupe : les membres se voient entre eux (presence), meme hors contacts. -->
    <div
      v-if="isOmnichatGroup && groupMembers.length > 0"
      class="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-white/[0.04] px-5 py-2"
    >
      <span class="shrink-0 text-[11px] uppercase tracking-[0.1em] text-zinc-600">Membres</span>
      <span
        v-for="member in groupMembers"
        :key="member.id"
        class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.05] py-1 pl-1 pr-2.5 text-xs text-zinc-300"
        :title="member.online ? 'En ligne' : 'Hors ligne'"
      >
        <span class="relative grid size-5 place-items-center rounded-full bg-white/[0.08] text-[10px] font-semibold">
          {{ member.pseudo.trim().slice(0, 1).toUpperCase() || '?' }}
          <span
            class="absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-ink-950"
            :class="member.online ? 'bg-accent-mint' : 'bg-zinc-600'"
          />
        </span>
        {{ member.pseudo }}
      </span>
    </div>

    <div
      v-if="conversation"
      ref="messagesScrollRef"
      class="min-h-0 flex-1 overflow-y-auto px-6 py-6"
    >
      <div
        v-if="conversation.messages.length === 0"
        class="grid min-h-full place-items-center text-center text-sm text-zinc-500"
      >
        <div
          v-if="store.awaitingMessagesFor === conversation.id"
          class="flex flex-col items-center gap-3 text-zinc-400"
        >
          <Spinner :size="22" label="Chargement des messages" />
          <span class="text-xs uppercase tracking-[0.18em] text-zinc-500">
            Chargement des messages...
          </span>
        </div>
        <span v-else>Aucun message dans cette conversation pour le moment.</span>
      </div>

      <div v-else class="mx-auto flex max-w-3xl flex-col gap-4">
        <div
          v-for="message in conversation.messages"
          :key="message.id"
          class="group/message flex gap-3"
          :class="message.direction === 'outgoing' ? 'flex-row-reverse' : 'flex-row'"
        >
          <div
            class="grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold uppercase shadow-line"
            :class="
              message.direction === 'outgoing'
                ? 'bg-accent-mint text-ink-950'
                : 'bg-white/[0.08] text-zinc-200'
            "
          >
            {{ avatarInitial(message) }}
          </div>

          <div
            class="flex min-w-0 max-w-[78%] flex-col gap-1"
            :class="message.direction === 'outgoing' ? 'items-end' : 'items-start'"
          >
            <div
              class="flex items-center gap-2 px-1 text-xs"
              :class="message.direction === 'outgoing' ? 'flex-row-reverse' : 'flex-row'"
            >
              <span
                class="font-semibold"
                :class="message.direction === 'outgoing' ? 'text-accent-mint' : 'text-zinc-200'"
              >
                {{ displayName(message) }}
              </span>
              <span class="text-zinc-600">
                {{ formatTimestamp(message.receivedAt ?? message.sentAt) }}
              </span>
            </div>
            <div
              v-if="message.bodyPreview || (message.bodyTokens && message.bodyTokens.length > 0)"
              class="whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-line"
              :class="
                message.direction === 'outgoing'
                  ? 'rounded-tr-sm bg-accent-mint/15 text-zinc-50 ring-1 ring-accent-mint/30'
                  : 'rounded-tl-sm bg-white/[0.055] text-zinc-100'
              "
            >
              <MessageContent
                :tokens="message.bodyTokens"
                :fallback="message.bodyPreview"
                :account-id="conversation?.accountId"
              />
            </div>
            <MessageAttachments
              :attachments="message.attachments"
              :align="message.direction === 'outgoing' ? 'end' : 'start'"
            />
            <MessageReactions
              v-if="!isOptimisticId(message.id)"
              :reactions="message.reactions"
              :align="message.direction === 'outgoing' ? 'end' : 'start'"
              @toggle="(name: string) => { void onToggleReaction(message.id, name) }"
            />
          </div>
        </div>

        <p
          v-if="showReadReceipt"
          class="px-1 text-right text-[11px] text-zinc-500"
        >
          Lu
        </p>
      </div>
    </div>

    <footer
      v-if="conversation"
      class="shrink-0 border-t border-white/[0.04] bg-ink-900/65 p-4"
    >
      <div class="mx-auto max-w-3xl">
        <p
          v-if="reactionFeedback"
          class="mb-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200"
        >
          {{ reactionFeedback }}
        </p>
        <div
          class="rounded-2xl bg-ink-950/70 p-3 shadow-line transition focus-within:ring-1 focus-within:ring-accent-mint/40"
        >
          <div
            v-if="pendingAttachments.length > 0"
            class="mb-2 flex flex-wrap gap-2"
          >
            <div
              v-for="(file, index) in pendingAttachments"
              :key="`${file.name}:${index}`"
              class="flex max-w-[260px] items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.04] px-2.5 py-1.5 text-xs text-zinc-200"
            >
              <component
                :is="isImageAttachment(file) ? ImageIcon : FileText"
                :size="14"
                class="shrink-0 text-zinc-400"
              />
              <div class="flex min-w-0 flex-col leading-tight">
                <span class="truncate">{{ file.name }}</span>
                <span class="text-[10px] text-zinc-500">{{ formatBytes(file.size) }}</span>
              </div>
              <button
                class="grid size-5 place-items-center rounded text-zinc-500 transition hover:bg-white/[0.08] hover:text-zinc-200 disabled:opacity-30"
                type="button"
                :disabled="isSending"
                :title="`Retirer ${file.name}`"
                @click="removePendingAttachment(index)"
              >
                <X :size="12" />
              </button>
            </div>
          </div>
          <p
            v-if="attachmentError"
            class="mb-2 text-xs text-rose-300"
          >
            {{ attachmentError }}
          </p>
          <textarea
            ref="textareaRef"
            v-model="draft"
            class="min-h-[60px] w-full resize-none bg-transparent text-sm leading-6 text-zinc-100 placeholder-zinc-600 outline-none disabled:opacity-60"
            :placeholder="`Ecrire dans ${conversation.title}...`"
            rows="2"
            :disabled="isSending"
            @keydown="onKeydown"
            @input="onComposerInput"
            @blur="isOmnichat && conversation ? omnichatStore.stopTypingNow(conversation.id) : undefined"
          />
          <input
            ref="fileInputRef"
            type="file"
            multiple
            class="hidden"
            @change="onFilesSelected"
          />
          <div class="mt-2 flex items-center justify-between">
            <div class="flex items-center gap-1">
              <button
                class="grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-30"
                type="button"
                :disabled="isSending"
                title="Ajouter une piece jointe"
                @click="openFilePicker"
              >
                <Paperclip :size="15" />
              </button>
              <EmojiPickerPopover @select="insertEmoji" />
              <TenorPickerPopover @select="insertTenorGif" />
            </div>
            <BaseButton
              :disabled="!canSend"
              variant="primary"
              type="button"
              @click="send"
            >
              <Spinner v-if="isSending" :size="15" label="Envoi du message" />
              <Send v-else :size="15" />
              {{ isSending ? 'Envoi...' : 'Envoyer' }}
            </BaseButton>
          </div>
        </div>
      </div>
    </footer>

    <section
      v-else
      class="grid min-h-0 flex-1 place-items-center px-8 py-12 text-center"
    >
      <div class="max-w-md">
        <div class="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-accent-mint/12 text-accent-mint shadow-line">
          <MessageSquareText :size="24" />
        </div>
        <h3 class="text-lg font-semibold text-white">Choisissez une conversation</h3>
        <p class="mt-2 text-sm leading-6 text-zinc-500">
          {{
            store.activeAccount
              ? `Selectionnez une conversation dans ${store.activeAccount.label} pour voir les messages.`
              : 'Selectionnez un service dans la barre de gauche puis une conversation.'
          }}
        </p>
      </div>
    </section>

    <div
      v-if="store.loadingConversationId && store.loadingConversationId !== conversation?.id"
      class="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-ink-950/55 backdrop-blur-[2px]"
    >
      <div class="flex items-center gap-2 rounded-full bg-ink-900/85 px-3 py-1.5 text-xs text-zinc-300 shadow-lift">
        <Spinner :size="14" label="Ouverture de la conversation" />
        <span>Ouverture...</span>
      </div>
    </div>
  </article>
</template>

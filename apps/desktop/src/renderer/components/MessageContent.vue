<script setup lang="ts">
import { get as getEmoji } from 'node-emoji'
import { unicodeFromSlackShortcode } from '@shared/slackEmoji'
import type { MessageContentToken, UUID } from '@shared/models'
import { useAppStore } from '@renderer/stores/appStore'

const props = defineProps<{
  tokens?: MessageContentToken[]
  fallback?: string
  accountId?: UUID
}>()

const store = useAppStore()

const renderEmojiName = (name: string): string => {
  return (
    unicodeFromSlackShortcode(name)
    || getEmoji(name)
    || `:${name}:`
  )
}

const handleLinkClick = (href: string): void => {
  void window.omnidesk?.shell?.openExternal(href)
}

const handleChannelClick = async (externalConversationId: string): Promise<void> => {
  const accountId = props.accountId
  if (!accountId) {
    return
  }

  const api = window.omnidesk
  if (!api?.conversations?.lookupExternal) {
    return
  }

  try {
    const result = await api.conversations.lookupExternal(accountId, externalConversationId)
    if (result?.conversationId) {
      await store.selectConversation(result.conversationId)
    }
  } catch {
    // Pas critique si on n'arrive pas a resoudre.
  }
}
</script>

<template>
  <span v-if="tokens && tokens.length > 0" class="break-words">
    <template v-for="(token, index) in tokens" :key="index">
      <span v-if="token.type === 'text'">{{ token.text }}</span>
      <span
        v-else-if="token.type === 'mention-user'"
        class="rounded bg-accent-mint/20 px-1 font-medium text-accent-mint"
        :title="`Utilisateur ${token.userId}`"
      >{{ token.label }}</span>
      <span
        v-else-if="token.type === 'mention-keyword'"
        class="rounded bg-accent-gold/15 px-1 font-medium text-accent-gold"
      >{{ token.label }}</span>
      <button
        v-else-if="token.type === 'channel-link'"
        class="rounded bg-accent-sky/15 px-1 font-medium text-accent-sky underline-offset-2 hover:underline"
        type="button"
        @click="handleChannelClick(token.externalConversationId)"
      >{{ token.label }}</button>
      <button
        v-else-if="token.type === 'link'"
        class="break-all text-accent-sky underline-offset-2 hover:underline"
        type="button"
        @click="handleLinkClick(token.href)"
      >{{ token.label }}</button>
      <span v-else-if="token.type === 'emoji'">{{ renderEmojiName(token.name) }}</span>
    </template>
  </span>
  <span v-else>{{ fallback || '(message vide)' }}</span>
</template>

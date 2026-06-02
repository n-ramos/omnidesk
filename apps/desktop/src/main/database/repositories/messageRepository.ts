import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import type {
  AttachmentSummary,
  MessageReactionSummary,
  MessageSummary,
  ProviderKind,
  UpdateMessageStateInput,
  UUID,
} from '@shared/models'
import { buildTextPreview } from '@shared/textPreview'
import type {
  ProviderMessageAttachment,
  ProviderMessageReaction,
  ProviderMessageRecord,
} from '@main/providers/provider.types'
import { AttachmentRepository } from './attachmentRepository'

export interface InsertOutgoingMessageInput {
  accountId: UUID
  providerId: ProviderKind
  conversationId: UUID
  externalMessageId: string
  body: string
  senderName?: string
  senderAddress?: string
  sentAt: string
  attachments?: ProviderMessageAttachment[]
}

export interface InsertIncomingNativeMessageInput {
  accountId: UUID
  providerId: ProviderKind
  conversationId: UUID
  externalMessageId: string
  body: string
  senderName?: string
  senderAddress?: string
  receivedAt: string
  isUnread: boolean
}

const aggregateReactions = (
  rows: { name: string; is_self: 0 | 1 }[],
): MessageReactionSummary[] => {
  const map = new Map<string, MessageReactionSummary>()
  for (const row of rows) {
    let reaction = map.get(row.name)
    if (!reaction) {
      reaction = { name: row.name, count: 0, mine: false }
      map.set(row.name, reaction)
    }
    reaction.count += 1
    if (row.is_self === 1) {
      reaction.mine = true
    }
  }
  return [...map.values()]
}

export class MessageRepository {
  constructor(private readonly db: Database) {}

  insertOutgoing(input: InsertOutgoingMessageInput): MessageSummary {
    const id = randomUUID()
    const preview = buildTextPreview(input.body, 280) ?? ''
    let storedAttachments: AttachmentSummary[] = []

    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO messages (
            id,
            provider_id,
            account_id,
            conversation_id,
            external_message_id,
            direction,
            sender_name,
            sender_address,
            body_plain,
            body_preview,
            sent_at
          ) VALUES (?, ?, ?, ?, ?, 'outgoing', ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.providerId,
          input.accountId,
          input.conversationId,
          input.externalMessageId,
          input.senderName ?? null,
          input.senderAddress ?? null,
          input.body,
          preview,
          input.sentAt,
        )

      this.db
        .prepare(
          `UPDATE conversations
           SET last_message_preview = ?,
               last_message_at = ?,
               updated_at = datetime('now')
           WHERE id = ?`,
        )
        .run(preview, input.sentAt, input.conversationId)

      if (input.attachments && input.attachments.length > 0) {
        storedAttachments = new AttachmentRepository(this.db).replaceForMessage(
          id,
          input.providerId,
          input.attachments,
        )
      }
    })

    transaction()

    return {
      id,
      providerId: input.providerId,
      conversationId: input.conversationId,
      externalMessageId: input.externalMessageId,
      direction: 'outgoing',
      senderName: input.senderName,
      senderAddress: input.senderAddress,
      bodyPreview: preview,
      sentAt: input.sentAt,
      state: 'read',
      attachments: storedAttachments.length > 0 ? storedAttachments : undefined,
    }
  }

  // Message ENTRANT natif (omnichat) recu en push (WebSocket). Calque sur
  // insertOutgoing mais direction 'incoming' + drapeau is_unread (alimente le
  // compteur de non-lus) et met a jour le resume de conversation.
  insertIncomingNative(input: InsertIncomingNativeMessageInput): MessageSummary {
    const id = randomUUID()
    const preview = buildTextPreview(input.body, 280) ?? ''

    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO messages (
            id,
            provider_id,
            account_id,
            conversation_id,
            external_message_id,
            direction,
            sender_name,
            sender_address,
            body_plain,
            body_preview,
            received_at,
            is_unread
          ) VALUES (?, ?, ?, ?, ?, 'incoming', ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.providerId,
          input.accountId,
          input.conversationId,
          input.externalMessageId,
          input.senderName ?? null,
          input.senderAddress ?? null,
          input.body,
          preview,
          input.receivedAt,
          input.isUnread ? 1 : 0,
        )

      this.db
        .prepare(
          `UPDATE conversations
           SET last_message_preview = ?,
               last_message_at = ?,
               updated_at = datetime('now')
           WHERE id = ?`,
        )
        .run(preview, input.receivedAt, input.conversationId)
    })

    transaction()

    return {
      id,
      providerId: input.providerId,
      conversationId: input.conversationId,
      externalMessageId: input.externalMessageId,
      direction: 'incoming',
      senderName: input.senderName,
      senderAddress: input.senderAddress,
      bodyPreview: preview,
      receivedAt: input.receivedAt,
      state: input.isUnread ? 'unread' : 'read',
    }
  }

  // Reconcilie un message sortant optimiste (identifie par clientMsgId) avec
  // l'identifiant definitif serveur (serverMsgId) une fois le msg-ack recu.
  reconcileSentNative(
    accountId: UUID,
    providerId: ProviderKind,
    clientMsgId: string,
    serverMsgId: string,
    sentAt: string,
  ): void {
    this.db
      .prepare(
        `UPDATE messages
         SET external_message_id = ?,
             sent_at = ?,
             updated_at = datetime('now')
         WHERE account_id = ? AND provider_id = ? AND external_message_id = ?`,
      )
      .run(serverMsgId, sentAt, accountId, providerId, clientMsgId)
  }

  updateState(input: UpdateMessageStateInput): MessageSummary | null {
    const message = this.db
      .prepare(
        `SELECT
          id,
          provider_id AS providerId,
          conversation_id AS conversationId,
          external_message_id AS externalMessageId,
          direction,
          sender_name AS senderName,
          sender_address AS senderAddress,
          body_preview AS bodyPreview,
          received_at AS receivedAt,
          sent_at AS sentAt
         FROM messages
         WHERE id = ?`,
      )
      .get(input.messageId) as Omit<MessageSummary, 'state'> | undefined

    if (!message) {
      return null
    }

    if (input.enabled) {
      this.db
        .prepare(
          `INSERT INTO local_message_states (id, message_id, state, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(message_id, state) DO UPDATE SET updated_at = datetime('now')`,
        )
        .run(randomUUID(), input.messageId, input.state)
    } else {
      this.db
        .prepare(`DELETE FROM local_message_states WHERE message_id = ? AND state = ?`)
        .run(input.messageId, input.state)
    }

    return {
      ...message,
      state: input.enabled ? input.state : 'read',
    }
  }

  replaceReactionsForMessage(
    messageId: string,
    reactions: ProviderMessageReaction[] | undefined,
    selfExternalUserId: string | undefined,
  ): void {
    const deleteStatement = this.db.prepare(`DELETE FROM message_reactions WHERE message_id = ?`)
    const insertStatement = this.db.prepare(
      `INSERT INTO message_reactions (id, message_id, name, external_user_id, is_self)
       VALUES (?, ?, ?, ?, ?)`,
    )

    const transaction = this.db.transaction(() => {
      deleteStatement.run(messageId)

      for (const reaction of reactions ?? []) {
        const name = reaction.name.trim()
        if (!name) {
          continue
        }

        const userIds = reaction.externalUserIds.length > 0
          ? reaction.externalUserIds
          : Array.from({ length: Math.max(reaction.count, 0) }, (_, index) => `unknown:${index}`)

        for (const externalUserId of userIds) {
          insertStatement.run(
            randomUUID(),
            messageId,
            name,
            externalUserId,
            selfExternalUserId && selfExternalUserId === externalUserId ? 1 : 0,
          )
        }
      }
    })

    transaction()
  }

  addReaction(
    messageId: string,
    name: string,
    externalUserId: string,
    isSelf: boolean,
  ): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO message_reactions (id, message_id, name, external_user_id, is_self)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), messageId, name, externalUserId, isSelf ? 1 : 0)
  }

  removeReaction(messageId: string, name: string, externalUserId: string): void {
    this.db
      .prepare(
        `DELETE FROM message_reactions
         WHERE message_id = ? AND name = ? AND external_user_id = ?`,
      )
      .run(messageId, name, externalUserId)
  }

  getReactionsForMessage(messageId: string): MessageReactionSummary[] {
    const rows = this.db
      .prepare(`SELECT name, is_self FROM message_reactions WHERE message_id = ?`)
      .all(messageId) as { name: string; is_self: 0 | 1 }[]

    return aggregateReactions(rows)
  }

  getReactionsForConversation(conversationId: string): Map<string, MessageReactionSummary[]> {
    const rows = this.db
      .prepare(
        `SELECT mr.message_id, mr.name, mr.is_self
         FROM message_reactions mr
         INNER JOIN messages m ON m.id = mr.message_id
         WHERE m.conversation_id = ?`,
      )
      .all(conversationId) as { message_id: string; name: string; is_self: 0 | 1 }[]

    const grouped = new Map<string, { name: string; is_self: 0 | 1 }[]>()
    for (const row of rows) {
      const bucket = grouped.get(row.message_id)
      if (bucket) {
        bucket.push({ name: row.name, is_self: row.is_self })
      } else {
        grouped.set(row.message_id, [{ name: row.name, is_self: row.is_self }])
      }
    }

    const result = new Map<string, MessageReactionSummary[]>()
    for (const [messageId, entries] of grouped) {
      result.set(messageId, aggregateReactions(entries))
    }
    return result
  }

  findReactionContext(messageId: string): {
    accountId: string
    providerId: ProviderKind
    externalMessageId: string
    externalConversationId: string
  } | null {
    const row = this.db
      .prepare(
        `SELECT messages.account_id AS account_id,
                messages.provider_id AS provider_id,
                messages.external_message_id AS external_message_id,
                conversations.external_conversation_id AS external_conversation_id
         FROM messages
         INNER JOIN conversations ON conversations.id = messages.conversation_id
         WHERE messages.id = ?`,
      )
      .get(messageId) as
      | {
          account_id: string
          provider_id: ProviderKind
          external_message_id: string
          external_conversation_id: string
        }
      | undefined

    if (!row) {
      return null
    }

    return {
      accountId: row.account_id,
      providerId: row.provider_id,
      externalMessageId: row.external_message_id,
      externalConversationId: row.external_conversation_id,
    }
  }

  hasExternalMessage(
    accountId: string,
    providerId: ProviderKind,
    externalMessageId: string,
  ): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 AS found
         FROM messages
         WHERE account_id = ? AND provider_id = ? AND external_message_id = ?
         LIMIT 1`,
      )
      .get(accountId, providerId, externalMessageId) as { found: 1 } | undefined

    return !!row
  }

  findIdByExternal(
    accountId: string,
    providerId: ProviderKind,
    externalMessageId: string,
  ): { id: string; conversationId: string; externalConversationId: string } | null {
    const row = this.db
      .prepare(
        `SELECT messages.id AS id,
                messages.conversation_id AS conversation_id,
                conversations.external_conversation_id AS external_conversation_id
         FROM messages
         INNER JOIN conversations ON conversations.id = messages.conversation_id
         WHERE messages.account_id = ?
           AND messages.provider_id = ?
           AND messages.external_message_id = ?`,
      )
      .get(accountId, providerId, externalMessageId) as
      | { id: string; conversation_id: string; external_conversation_id: string }
      | undefined

    if (!row) {
      return null
    }

    return {
      id: row.id,
      conversationId: row.conversation_id,
      externalConversationId: row.external_conversation_id,
    }
  }

  upsertForAccount(
    accountId: string,
    providerId: ProviderKind,
    messages: ProviderMessageRecord[],
    conversationIdsByExternalId: Map<string, string>,
    options: { selfExternalUserId?: string; mode?: 'sync' | 'append' } = {},
  ): { insertedMessages: ProviderMessageRecord[] } {
    const insertedMessages: ProviderMessageRecord[] = []

    const resolveId = this.db.prepare(
      `SELECT id, conversation_id
       FROM messages
       WHERE provider_id = ? AND account_id = ? AND external_message_id = ?`,
    )
    const insertMessage = this.db.prepare(
      `INSERT INTO messages (
        id,
        provider_id,
        account_id,
        conversation_id,
        external_message_id,
        direction,
        sender_name,
        sender_address,
        body_plain,
        body_html,
        body_preview,
        body_tokens,
        received_at,
        sent_at,
        is_unread,
        external_uid,
        folder_path,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    const updateMessage = this.db.prepare(
      `UPDATE messages SET
        direction = ?,
        sender_name = COALESCE(?, sender_name),
        sender_address = COALESCE(?, sender_address),
        body_plain = COALESCE(?, body_plain),
        body_html = COALESCE(?, body_html),
        body_preview = COALESCE(?, body_preview),
        body_tokens = COALESCE(?, body_tokens),
        received_at = COALESCE(?, received_at),
        sent_at = COALESCE(?, sent_at),
        is_unread = COALESCE(?, is_unread),
        external_uid = COALESCE(?, external_uid),
        folder_path = COALESCE(?, folder_path),
        updated_at = datetime('now')
       WHERE id = ?`,
    )
    const deleteMissingMessages = this.db.prepare(
      `DELETE FROM messages
       WHERE provider_id = ?
         AND account_id = ?
         AND external_message_id NOT IN (SELECT value FROM json_each(?))`,
    )
    const clearAccountMessages = this.db.prepare(
      `DELETE FROM messages
       WHERE provider_id = ? AND account_id = ?`,
    )
    const updateConversationSummary = this.db.prepare(
      `UPDATE conversations
       SET last_message_preview = ?,
           last_message_at = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
    )
    const deleteReactions = this.db.prepare(
      `DELETE FROM message_reactions WHERE message_id = ?`,
    )
    const insertReaction = this.db.prepare(
      `INSERT INTO message_reactions (id, message_id, name, external_user_id, is_self)
       VALUES (?, ?, ?, ?, ?)`,
    )
    const attachmentRepository = new AttachmentRepository(this.db)

    const isAppend = options.mode === 'append'

    const transaction = this.db.transaction((items: ProviderMessageRecord[]) => {
      if (items.length === 0) {
        if (!isAppend) {
          clearAccountMessages.run(providerId, accountId)
        }
        return
      }

      const latestByConversation = new Map<
        string,
        { bodyPreview?: string; messageAt?: string }
      >()

      for (const message of items) {
        const existing = resolveId.get(
          providerId,
          accountId,
          message.externalMessageId,
        ) as { id: string; conversation_id: string } | undefined

        if (existing) {
          updateMessage.run(
            message.direction,
            message.senderName,
            message.senderAddress,
            message.bodyPlain,
            message.bodyHtml,
            message.bodyPreview,
            message.bodyTokens ? JSON.stringify(message.bodyTokens) : null,
            message.receivedAt,
            message.sentAt,
            typeof message.isUnread === 'boolean' ? (message.isUnread ? 1 : 0) : null,
            typeof message.externalUid === 'number' ? message.externalUid : null,
            message.folderPath ?? null,
            existing.id,
          )

          if (!message.envelopeOnly) {
            deleteReactions.run(existing.id)
            for (const reaction of message.reactions ?? []) {
              const name = reaction.name.trim()
              if (!name) continue
              const userIds = reaction.externalUserIds.length > 0
                ? reaction.externalUserIds
                : Array.from(
                    { length: Math.max(reaction.count, 0) },
                    (_, index) => `unknown:${index}`,
                  )
              for (const externalUserId of userIds) {
                insertReaction.run(
                  randomUUID(),
                  existing.id,
                  name,
                  externalUserId,
                  options.selfExternalUserId && options.selfExternalUserId === externalUserId ? 1 : 0,
                )
              }
            }
            attachmentRepository.replaceForMessage(existing.id, providerId, message.attachments)

            const messageAt = message.receivedAt ?? message.sentAt
            if (message.bodyPreview) {
              const currentLatest = latestByConversation.get(existing.conversation_id)
              if (!currentLatest || (messageAt ?? '') >= (currentLatest.messageAt ?? '')) {
                latestByConversation.set(existing.conversation_id, {
                  bodyPreview: message.bodyPreview,
                  messageAt,
                })
              }
            }
          }
          continue
        }

        const conversationId = conversationIdsByExternalId.get(message.conversationExternalId)
        if (!conversationId) {
          continue
        }

        const messageId = randomUUID()
        insertedMessages.push(message)

        insertMessage.run(
          messageId,
          providerId,
          accountId,
          conversationId,
          message.externalMessageId,
          message.direction,
          message.senderName,
          message.senderAddress,
          message.bodyPlain,
          message.bodyHtml,
          message.bodyPreview,
          message.bodyTokens ? JSON.stringify(message.bodyTokens) : null,
          message.receivedAt,
          message.sentAt,
          message.isUnread ? 1 : 0,
          typeof message.externalUid === 'number' ? message.externalUid : null,
          message.folderPath ?? null,
        )

        for (const reaction of message.reactions ?? []) {
          const name = reaction.name.trim()
          if (!name) continue
          const userIds = reaction.externalUserIds.length > 0
            ? reaction.externalUserIds
            : Array.from(
                { length: Math.max(reaction.count, 0) },
                (_, index) => `unknown:${index}`,
              )
          for (const externalUserId of userIds) {
            insertReaction.run(
              randomUUID(),
              messageId,
              name,
              externalUserId,
              options.selfExternalUserId && options.selfExternalUserId === externalUserId ? 1 : 0,
            )
          }
        }

        attachmentRepository.replaceForMessage(messageId, providerId, message.attachments)

        const messageAt = message.receivedAt ?? message.sentAt
        const currentLatest = latestByConversation.get(conversationId)
        if (!currentLatest || (messageAt ?? '') >= (currentLatest.messageAt ?? '')) {
          latestByConversation.set(conversationId, {
            bodyPreview: message.bodyPreview,
            messageAt,
          })
        }
      }

      if (!isAppend) {
        deleteMissingMessages.run(
          providerId,
          accountId,
          JSON.stringify(messages.map((message) => message.externalMessageId)),
        )
      }

      for (const [conversationId, latest] of latestByConversation) {
        updateConversationSummary.run(latest.bodyPreview, latest.messageAt, conversationId)
      }
    })

    transaction(messages)
    return { insertedMessages }
  }

  findImapMessagesByFolder(conversationId: string): Map<string, number[]> {
    const rows = this.db
      .prepare(
        `SELECT external_uid, folder_path
         FROM messages
         WHERE conversation_id = ?
           AND external_uid IS NOT NULL
           AND folder_path IS NOT NULL`,
      )
      .all(conversationId) as Array<{ external_uid: number; folder_path: string }>

    const grouped = new Map<string, number[]>()
    for (const row of rows) {
      const bucket = grouped.get(row.folder_path) ?? []
      bucket.push(row.external_uid)
      grouped.set(row.folder_path, bucket)
    }
    return grouped
  }

  findOldestImapUid(accountId: string, folderPath: string): number | undefined {
    const row = this.db
      .prepare(
        `SELECT MIN(external_uid) AS uid
         FROM messages
         WHERE account_id = ?
           AND provider_id = 'imap'
           AND folder_path = ?
           AND external_uid IS NOT NULL`,
      )
      .get(accountId, folderPath) as { uid: number | null } | undefined

    return row?.uid ?? undefined
  }

  findUnreadImapMessages(conversationId: string): Array<{
    id: string
    externalUid: number
    folderPath: string
  }> {
    const rows = this.db
      .prepare(
        `SELECT id, external_uid, folder_path
         FROM messages
         WHERE conversation_id = ?
           AND is_unread = 1
           AND external_uid IS NOT NULL
           AND folder_path IS NOT NULL`,
      )
      .all(conversationId) as Array<{ id: string; external_uid: number; folder_path: string }>

    return rows.map((row) => ({
      id: row.id,
      externalUid: row.external_uid,
      folderPath: row.folder_path,
    }))
  }

  markConversationRead(conversationId: string, read: boolean): number {
    const result = this.db
      .prepare(
        `UPDATE messages
         SET is_unread = ?,
             updated_at = datetime('now')
         WHERE conversation_id = ?
           AND is_unread = ?`,
      )
      .run(read ? 0 : 1, conversationId, read ? 1 : 0)
    return Number(result.changes ?? 0)
  }

  appendForAccount(
    accountId: string,
    providerId: ProviderKind,
    messages: ProviderMessageRecord[],
    conversationIdsByExternalId: Map<string, string>,
    options: { selfExternalUserId?: string } = {},
  ): { insertedMessages: ProviderMessageRecord[] } {
    if (messages.length === 0) {
      return { insertedMessages: [] }
    }
    return this.upsertForAccount(
      accountId,
      providerId,
      messages,
      conversationIdsByExternalId,
      { ...options, mode: 'append' },
    )
  }
}

import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import type {
  AttachmentSummary,
  ConversationDetail,
  ConversationFilters,
  ConversationKind,
  ConversationSummary,
  MessageContentToken,
  MessageDirection,
  MessageReactionSummary,
  MessageState,
  MessageSummary,
  ProviderKind,
} from '@shared/models'
import type { ProviderConversationRecord } from '@main/providers/provider.types'
import { AttachmentRepository } from './attachmentRepository'
import { MessageRepository } from './messageRepository'

interface ConversationRow {
  id: string
  provider_id: ProviderKind
  account_id: string
  kind?: ConversationKind
  subject?: string
  title: string
  last_message_preview?: string
  last_message_at?: string
  last_sender_name?: string
  last_sender_address?: string
  last_direction?: MessageDirection
  unread_count: number
  is_muted: 0 | 1
}

interface ParticipantRow {
  id: string
  display_name?: string
  address?: string
  role?: string
}

interface MessageRow {
  id: string
  provider_id: ProviderKind
  conversation_id: string
  external_message_id: string
  direction: MessageDirection
  sender_name?: string
  sender_address?: string
  body_preview?: string
  body_tokens?: string
  received_at?: string
  sent_at?: string
  state?: MessageState
}

const parseTokens = (value?: string): MessageContentToken[] | undefined => {
  if (!value) {
    return undefined
  }

  try {
    const parsed = JSON.parse(value) as MessageContentToken[]
    return Array.isArray(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

const mapConversation = (row: ConversationRow): ConversationSummary => ({
  id: row.id,
  providerId: row.provider_id,
  accountId: row.account_id,
  kind: row.kind ?? undefined,
  subject: row.subject,
  title: row.title,
  lastMessagePreview: row.last_message_preview,
  lastMessageAt: row.last_message_at,
  lastSenderName: row.last_sender_name ?? undefined,
  lastSenderAddress: row.last_sender_address ?? undefined,
  lastDirection: row.last_direction ?? undefined,
  unreadCount: row.unread_count,
  isMuted: row.is_muted === 1,
})

const mapMessage = (
  row: MessageRow,
  reactionsByMessageId?: Map<string, MessageReactionSummary[]>,
  attachmentsByMessageId?: Map<string, AttachmentSummary[]>,
): MessageSummary => ({
  id: row.id,
  providerId: row.provider_id,
  conversationId: row.conversation_id,
  externalMessageId: row.external_message_id,
  direction: row.direction,
  senderName: row.sender_name,
  senderAddress: row.sender_address,
  bodyPreview: row.body_preview,
  bodyTokens: parseTokens(row.body_tokens),
  receivedAt: row.received_at,
  sentAt: row.sent_at,
  state: row.state ?? 'unread',
  reactions: reactionsByMessageId?.get(row.id),
  attachments: attachmentsByMessageId?.get(row.id),
})

export class ConversationRepository {
  constructor(private readonly db: Database) {}

  list(filters: ConversationFilters = {}): ConversationSummary[] {
    const query = `%${filters.query?.trim() ?? ''}%`
    const rows = this.db
      .prepare(
        `SELECT
          conversations.id AS id,
          conversations.provider_id AS provider_id,
          conversations.account_id AS account_id,
          conversations.kind AS kind,
          conversations.subject AS subject,
          conversations.title AS title,
          conversations.last_message_preview AS last_message_preview,
          conversations.last_message_at AS last_message_at,
          conversations.is_muted AS is_muted,
          latest.sender_name AS last_sender_name,
          latest.sender_address AS last_sender_address,
          latest.direction AS last_direction,
          (
            SELECT COUNT(*)
            FROM notifications n
            WHERE n.conversation_id = conversations.id AND n.read_at IS NULL
          ) + (
            SELECT COUNT(*)
            FROM messages m
            WHERE m.conversation_id = conversations.id AND m.is_unread = 1
          ) AS unread_count
         FROM conversations
         LEFT JOIN messages latest ON latest.id = (
           SELECT id FROM messages m
           WHERE m.conversation_id = conversations.id
           ORDER BY COALESCE(m.received_at, m.sent_at, m.created_at) DESC
           LIMIT 1
         )
         WHERE (? IS NULL OR conversations.account_id = ?)
          AND (
            ? = 0 OR EXISTS (
              SELECT 1 FROM notifications n
              WHERE n.conversation_id = conversations.id AND n.read_at IS NULL
            ) OR EXISTS (
              SELECT 1 FROM messages m
              WHERE m.conversation_id = conversations.id AND m.is_unread = 1
            )
          )
          AND (
            ? = '%%'
            OR conversations.title LIKE ?
            OR conversations.subject LIKE ?
            OR conversations.last_message_preview LIKE ?
          )
         ORDER BY COALESCE(conversations.last_message_at, conversations.updated_at) DESC
         LIMIT 100`,
      )
      .all(
        filters.accountId ?? null,
        filters.accountId ?? null,
        filters.unreadOnly ? 1 : 0,
        query,
        query,
        query,
        query,
      ) as ConversationRow[]

    return rows.map(mapConversation)
  }

  upsertSingle(
    accountId: string,
    providerId: ProviderKind,
    conversation: ProviderConversationRecord,
  ): string {
    const existing = this.db
      .prepare(
        `SELECT id
         FROM conversations
         WHERE provider_id = ? AND account_id = ? AND external_conversation_id = ?`,
      )
      .get(providerId, accountId, conversation.externalConversationId) as
      | { id: string }
      | undefined

    const conversationId = existing?.id ?? randomUUID()

    this.db
      .prepare(
        `INSERT INTO conversations (
          id,
          provider_id,
          account_id,
          external_conversation_id,
          kind,
          title,
          subject,
          last_message_preview,
          last_message_at,
          unread_count,
          is_muted,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(provider_id, account_id, external_conversation_id) DO UPDATE SET
          kind = excluded.kind,
          title = excluded.title,
          updated_at = datetime('now')`,
      )
      .run(
        conversationId,
        providerId,
        accountId,
        conversation.externalConversationId,
        conversation.kind ?? null,
        conversation.title,
        conversation.subject,
        conversation.lastMessagePreview,
        conversation.lastMessageAt,
        conversation.unreadCount,
        conversation.isMuted ? 1 : 0,
      )

    return conversationId
  }

  findByExternal(
    accountId: string,
    externalConversationId: string,
  ): { conversationId: string } | null {
    const row = this.db
      .prepare(
        `SELECT id
         FROM conversations
         WHERE account_id = ? AND external_conversation_id = ?`,
      )
      .get(accountId, externalConversationId) as { id: string } | undefined

    return row ? { conversationId: row.id } : null
  }

  deleteById(conversationId: string): void {
    this.db.prepare(`DELETE FROM conversations WHERE id = ?`).run(conversationId)
  }

  // --- Conversations natives (omnichat) ----------------------------------
  // Push-driven : ces methodes creent/mettent a jour UNE conversation sans jamais
  // supprimer les autres (contrairement a upsertForAccount, oriente synchro). Elles
  // ancrent les DM/groupes omnichat sur le compte "self".
  ensureNativeConversation(input: {
    accountId: string
    externalConversationId: string
    title: string
    kind: ConversationKind
  }): string {
    const existing = this.db
      .prepare(
        `SELECT id FROM conversations
         WHERE provider_id = 'omnichat' AND account_id = ? AND external_conversation_id = ?`,
      )
      .get(input.accountId, input.externalConversationId) as { id: string } | undefined

    if (existing) {
      return existing.id
    }

    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO conversations (
          id, provider_id, account_id, external_conversation_id,
          kind, title, unread_count, is_muted, updated_at
        ) VALUES (?, 'omnichat', ?, ?, ?, ?, 0, 0, datetime('now'))`,
      )
      .run(id, input.accountId, input.externalConversationId, input.kind, input.title)
    return id
  }

  updateNativeTitle(conversationId: string, title: string): void {
    this.db
      .prepare(`UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(title, conversationId)
  }

  setParticipants(
    conversationId: string,
    participants: Array<{ displayName?: string; address?: string; role?: string }>,
  ): void {
    const remove = this.db.prepare(
      `DELETE FROM conversation_participants WHERE conversation_id = ?`,
    )
    const insert = this.db.prepare(
      `INSERT INTO conversation_participants (
        id, conversation_id, external_participant_id, display_name, address, role
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    const transaction = this.db.transaction(() => {
      remove.run(conversationId)
      for (const participant of participants) {
        insert.run(
          randomUUID(),
          conversationId,
          participant.address ?? null,
          participant.displayName ?? null,
          participant.address ?? null,
          participant.role ?? null,
        )
      }
    })
    transaction()
  }

  removeParticipants(conversationId: string, addresses: string[]): void {
    if (addresses.length === 0) {
      return
    }
    const placeholders = addresses.map(() => '?').join(', ')
    this.db
      .prepare(
        `DELETE FROM conversation_participants
         WHERE conversation_id = ? AND address IN (${placeholders})`,
      )
      .run(conversationId, ...addresses)
  }

  addParticipants(
    conversationId: string,
    participants: Array<{ displayName?: string; address?: string; role?: string }>,
  ): void {
    const known = new Set(
      this.listParticipantAddresses(conversationId).map((address) => address.toLowerCase()),
    )
    const insert = this.db.prepare(
      `INSERT INTO conversation_participants (
        id, conversation_id, external_participant_id, display_name, address, role
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    const transaction = this.db.transaction(() => {
      for (const participant of participants) {
        if (participant.address && known.has(participant.address.toLowerCase())) {
          continue
        }
        insert.run(
          randomUUID(),
          conversationId,
          participant.address ?? null,
          participant.displayName ?? null,
          participant.address ?? null,
          participant.role ?? null,
        )
      }
    })
    transaction()
  }

  listParticipantAddresses(conversationId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT address FROM conversation_participants
         WHERE conversation_id = ? AND address IS NOT NULL`,
      )
      .all(conversationId) as { address: string }[]
    return rows.map((row) => row.address)
  }

  getReplyContext(conversationId: string): {
    subject?: string
    title: string
    recipients: string[]
    references: string[]
    lastExternalMessageId?: string
  } | null {
    const row = this.db
      .prepare(
        `SELECT subject, title
         FROM conversations
         WHERE id = ?`,
      )
      .get(conversationId) as { subject?: string; title: string } | undefined

    if (!row) {
      return null
    }

    const participantRows = this.db
      .prepare(
        `SELECT address
         FROM conversation_participants
         WHERE conversation_id = ?`,
      )
      .all(conversationId) as { address?: string }[]

    const recipients = [
      ...new Set(
        participantRows
          .map((entry) => entry.address?.trim().toLowerCase())
          .filter((entry): entry is string => typeof entry === 'string' && entry.includes('@')),
      ),
    ]

    const messageRows = this.db
      .prepare(
        `SELECT external_message_id, direction
         FROM messages
         WHERE conversation_id = ?
         ORDER BY COALESCE(received_at, sent_at, created_at) ASC`,
      )
      .all(conversationId) as { external_message_id: string; direction: 'incoming' | 'outgoing' }[]

    const references = messageRows.map((entry) => entry.external_message_id)
    const lastIncoming = [...messageRows].reverse().find((entry) => entry.direction === 'incoming')

    return {
      subject: row.subject ?? row.title,
      title: row.title,
      recipients,
      references,
      lastExternalMessageId: lastIncoming?.external_message_id ?? messageRows.at(-1)?.external_message_id,
    }
  }

  getProviderRef(
    conversationId: string,
  ): {
    accountId: string
    providerId: ProviderKind
    externalConversationId: string
    title: string
    kind?: ConversationKind
  } | null {
    const row = this.db
      .prepare(
        `SELECT account_id, provider_id, external_conversation_id, title, kind
         FROM conversations
         WHERE id = ?`,
      )
      .get(conversationId) as
      | {
          account_id: string
          provider_id: ProviderKind
          external_conversation_id: string
          title: string
          kind?: ConversationKind
        }
      | undefined

    if (!row) {
      return null
    }

    return {
      accountId: row.account_id,
      providerId: row.provider_id,
      externalConversationId: row.external_conversation_id,
      title: row.title,
      kind: row.kind ?? undefined,
    }
  }

  get(conversationId: string): ConversationDetail | null {
    const row = this.db
      .prepare(
        `SELECT
          conversations.id AS id,
          conversations.provider_id AS provider_id,
          conversations.account_id AS account_id,
          conversations.kind AS kind,
          conversations.subject AS subject,
          conversations.title AS title,
          conversations.last_message_preview AS last_message_preview,
          conversations.last_message_at AS last_message_at,
          conversations.is_muted AS is_muted,
          (
            SELECT COUNT(*)
            FROM notifications n
            WHERE n.conversation_id = conversations.id AND n.read_at IS NULL
          ) + (
            SELECT COUNT(*)
            FROM messages m
            WHERE m.conversation_id = conversations.id AND m.is_unread = 1
          ) AS unread_count
         FROM conversations
         WHERE conversations.id = ?`,
      )
      .get(conversationId) as ConversationRow | undefined

    if (!row) {
      return null
    }

    const participants = this.db
      .prepare(
        `SELECT id, display_name, address, role
         FROM conversation_participants
         WHERE conversation_id = ?
         ORDER BY display_name ASC`,
      )
      .all(conversationId) as ParticipantRow[]

    const messages = this.db
      .prepare(
        `SELECT
          messages.id,
          messages.provider_id,
          messages.conversation_id,
          messages.external_message_id,
          messages.direction,
          messages.sender_name,
          messages.sender_address,
          messages.body_preview,
          messages.body_tokens,
          messages.received_at,
          messages.sent_at,
          local_message_states.state
         FROM messages
         LEFT JOIN local_message_states ON local_message_states.message_id = messages.id
         WHERE messages.conversation_id = ?
         ORDER BY COALESCE(messages.received_at, messages.sent_at, messages.created_at) ASC`,
      )
      .all(conversationId) as MessageRow[]

    const reactionsByMessageId = new MessageRepository(this.db).getReactionsForConversation(
      conversationId,
    )
    const attachmentsByMessageId = new AttachmentRepository(this.db).getForConversation(
      conversationId,
    )

    return {
      ...mapConversation(row),
      participants,
      messages: messages.map((message) =>
        mapMessage(message, reactionsByMessageId, attachmentsByMessageId),
      ),
    }
  }

  upsertForAccount(
    accountId: string,
    providerId: ProviderKind,
    conversations: ProviderConversationRecord[],
    options: { mode?: 'sync' | 'append' } = {},
  ): Map<string, string> {
    const resolveId = this.db.prepare(
      `SELECT id
       FROM conversations
       WHERE provider_id = ? AND account_id = ? AND external_conversation_id = ?`,
    )
    const upsertConversation = this.db.prepare(
      `INSERT INTO conversations (
        id,
        provider_id,
        account_id,
        external_conversation_id,
        kind,
        title,
        subject,
        last_message_preview,
        last_message_at,
        unread_count,
        is_muted,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(provider_id, account_id, external_conversation_id) DO UPDATE SET
        kind = excluded.kind,
        title = excluded.title,
        subject = excluded.subject,
        last_message_preview = excluded.last_message_preview,
        last_message_at = excluded.last_message_at,
        unread_count = excluded.unread_count,
        is_muted = excluded.is_muted,
        updated_at = datetime('now')`,
    )
    const deleteParticipants = this.db.prepare(
      `DELETE FROM conversation_participants
       WHERE conversation_id = ?`,
    )
    const insertParticipant = this.db.prepare(
      `INSERT INTO conversation_participants (
        id,
        conversation_id,
        external_participant_id,
        display_name,
        address,
        role
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    const deleteMissingConversations = this.db.prepare(
      `DELETE FROM conversations
       WHERE provider_id = ?
         AND account_id = ?
         AND external_conversation_id NOT IN (SELECT value FROM json_each(?))`,
    )
    const clearAccountConversations = this.db.prepare(
      `DELETE FROM conversations
       WHERE provider_id = ? AND account_id = ?`,
    )

    const idsByExternalId = new Map<string, string>()
    const isAppend = options.mode === 'append'

    const transaction = this.db.transaction((items: ProviderConversationRecord[]) => {
      if (items.length === 0) {
        if (!isAppend) {
          clearAccountConversations.run(providerId, accountId)
        }
        return
      }

      const externalIds = items.map((item) => item.externalConversationId)

      for (const conversation of items) {
        const existing = resolveId.get(
          providerId,
          accountId,
          conversation.externalConversationId,
        ) as { id: string } | undefined
        const conversationId = existing?.id ?? randomUUID()

        upsertConversation.run(
          conversationId,
          providerId,
          accountId,
          conversation.externalConversationId,
          conversation.kind ?? null,
          conversation.title,
          conversation.subject,
          conversation.lastMessagePreview,
          conversation.lastMessageAt,
          conversation.unreadCount,
          conversation.isMuted ? 1 : 0,
        )

        deleteParticipants.run(conversationId)

        for (const participant of conversation.participants ?? []) {
          insertParticipant.run(
            randomUUID(),
            conversationId,
            participant.externalParticipantId,
            participant.displayName,
            participant.address,
            participant.role,
          )
        }

        idsByExternalId.set(conversation.externalConversationId, conversationId)
      }

      if (!isAppend) {
        deleteMissingConversations.run(providerId, accountId, JSON.stringify(externalIds))
      }
    })

    transaction(conversations)
    return idsByExternalId
  }
}

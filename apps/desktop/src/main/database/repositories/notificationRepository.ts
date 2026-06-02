import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import type { LocalNotification, NotificationLevel, ProviderKind } from '@shared/models'

interface NotificationRow {
  id: string
  level: NotificationLevel
  title: string
  body?: string
  provider_id?: ProviderKind
  account_id?: string
  conversation_id?: string
  created_at: string
  read_at?: string
}

const mapRow = (row: NotificationRow): LocalNotification => ({
  id: row.id,
  level: row.level,
  title: row.title,
  body: row.body,
  sourceProviderId: row.provider_id,
  accountId: row.account_id,
  conversationId: row.conversation_id,
  createdAt: row.created_at,
  readAt: row.read_at,
})

export class NotificationRepository {
  constructor(private readonly db: Database) {}

  list(options: { unreadOnly?: boolean } = {}): LocalNotification[] {
    const rows = this.db
      .prepare(
        `SELECT id, level, title, body, provider_id, account_id, conversation_id, created_at, read_at
         FROM notifications
         WHERE (? = 0 OR read_at IS NULL)
         ORDER BY created_at DESC
         LIMIT 100`,
      )
      .all(options.unreadOnly ? 1 : 0) as NotificationRow[]

    return rows.map(mapRow)
  }

  markRead(notificationId: string): void {
    this.db
      .prepare(`UPDATE notifications SET read_at = datetime('now') WHERE id = ?`)
      .run(notificationId)
  }

  markReadByConversation(conversationId: string): number {
    const result = this.db
      .prepare(
        `UPDATE notifications
         SET read_at = datetime('now')
         WHERE conversation_id = ? AND read_at IS NULL`,
      )
      .run(conversationId)

    return result.changes
  }

  clearAll(): number {
    const result = this.db.prepare(`DELETE FROM notifications`).run()
    return result.changes
  }

  create(input: {
    level?: NotificationLevel
    title: string
    body?: string
    providerId?: ProviderKind
    accountId?: string
    conversationId?: string
    messageId?: string
  }): LocalNotification {
    const id = randomUUID()

    this.db
      .prepare(
        `INSERT INTO notifications (
          id,
          provider_id,
          account_id,
          conversation_id,
          message_id,
          level,
          title,
          body
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.providerId,
        input.accountId,
        input.conversationId,
        input.messageId,
        input.level ?? 'info',
        input.title,
        input.body,
      )

    const row = this.db
      .prepare(
        `SELECT id, level, title, body, provider_id, account_id, conversation_id, created_at, read_at
         FROM notifications
         WHERE id = ?`,
      )
      .get(id) as NotificationRow

    return mapRow(row)
  }
}

import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import type {
  CreateReminderInput,
  Reminder,
  ReminderRecurrence,
  UpdateReminderInput,
} from '@shared/models'

interface ReminderRow {
  id: string
  title: string
  body: string | null
  recurrence_json: string
  next_occurrence_at: string
  last_fired_at: string | null
  is_enabled: number
  created_at: string
  updated_at: string
}

const parseRecurrence = (raw: string): ReminderRecurrence => JSON.parse(raw) as ReminderRecurrence

const mapRow = (row: ReminderRow): Reminder => ({
  id: row.id,
  title: row.title,
  body: row.body ?? undefined,
  recurrence: parseRecurrence(row.recurrence_json),
  nextOccurrenceAt: row.next_occurrence_at,
  lastFiredAt: row.last_fired_at ?? undefined,
  isEnabled: row.is_enabled === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export class ReminderRepository {
  constructor(private readonly db: Database) {}

  list(): Reminder[] {
    const rows = this.db
      .prepare(
        `SELECT id, title, body, recurrence_json, next_occurrence_at, last_fired_at,
                is_enabled, created_at, updated_at
         FROM reminders
         ORDER BY is_enabled DESC, next_occurrence_at ASC`,
      )
      .all() as ReminderRow[]

    return rows.map(mapRow)
  }

  get(id: string): Reminder | undefined {
    const row = this.db
      .prepare(
        `SELECT id, title, body, recurrence_json, next_occurrence_at, last_fired_at,
                is_enabled, created_at, updated_at
         FROM reminders
         WHERE id = ?`,
      )
      .get(id) as ReminderRow | undefined

    return row ? mapRow(row) : undefined
  }

  create(input: CreateReminderInput, nextOccurrenceAt: string): Reminder {
    const id = randomUUID()
    const recurrenceJson = JSON.stringify(input.recurrence)
    const enabled = input.isEnabled === false ? 0 : 1

    this.db
      .prepare(
        `INSERT INTO reminders (id, title, body, recurrence_json, next_occurrence_at, is_enabled)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.title, input.body ?? null, recurrenceJson, nextOccurrenceAt, enabled)

    const created = this.get(id)
    if (!created) {
      throw new Error('Reminder created but could not be retrieved')
    }
    return created
  }

  update(input: UpdateReminderInput, nextOccurrenceAt?: string): Reminder {
    const fields: string[] = []
    const values: Array<string | number | null> = []

    if (input.title !== undefined) {
      fields.push('title = ?')
      values.push(input.title)
    }
    if (input.body !== undefined) {
      fields.push('body = ?')
      values.push(input.body || null)
    }
    if (input.recurrence !== undefined) {
      fields.push('recurrence_json = ?')
      values.push(JSON.stringify(input.recurrence))
    }
    if (input.isEnabled !== undefined) {
      fields.push('is_enabled = ?')
      values.push(input.isEnabled ? 1 : 0)
    }
    if (nextOccurrenceAt !== undefined) {
      fields.push('next_occurrence_at = ?')
      values.push(nextOccurrenceAt)
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')")
      values.push(input.id)
      this.db.prepare(`UPDATE reminders SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }

    const updated = this.get(input.id)
    if (!updated) {
      throw new Error('Reminder not found after update')
    }
    return updated
  }

  delete(id: string): void {
    this.db.prepare(`DELETE FROM reminders WHERE id = ?`).run(id)
  }

  findDue(now: string): Reminder[] {
    const rows = this.db
      .prepare(
        `SELECT id, title, body, recurrence_json, next_occurrence_at, last_fired_at,
                is_enabled, created_at, updated_at
         FROM reminders
         WHERE is_enabled = 1 AND next_occurrence_at <= ?
         ORDER BY next_occurrence_at ASC`,
      )
      .all(now) as ReminderRow[]

    return rows.map(mapRow)
  }

  markFired(id: string, firedAt: string, nextOccurrenceAt: string | undefined): void {
    if (nextOccurrenceAt) {
      this.db
        .prepare(
          `UPDATE reminders
           SET last_fired_at = ?, next_occurrence_at = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .run(firedAt, nextOccurrenceAt, id)
    } else {
      this.db
        .prepare(
          `UPDATE reminders
           SET last_fired_at = ?, is_enabled = 0, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .run(firedAt, id)
    }
  }
}

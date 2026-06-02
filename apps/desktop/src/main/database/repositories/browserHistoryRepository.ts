import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import type { BrowserHistoryEntry, UUID } from '@shared/models'

interface HistoryRow {
  id: string
  space_id: string
  url: string
  title: string | null
  favicon_url: string | null
  visit_count: number
  first_visited_at: string
  last_visited_at: string
}

const mapRow = (row: HistoryRow): BrowserHistoryEntry => ({
  id: row.id,
  spaceId: row.space_id,
  url: row.url,
  title: row.title ?? undefined,
  faviconUrl: row.favicon_url ?? undefined,
  visitCount: row.visit_count,
  firstVisitedAt: row.first_visited_at,
  lastVisitedAt: row.last_visited_at,
})

const SELECT_COLUMNS = `id, space_id, url, title, favicon_url, visit_count,
  first_visited_at, last_visited_at`

export class BrowserHistoryRepository {
  constructor(private readonly db: Database) {}

  record(input: { spaceId: UUID; url: string; title?: string; faviconUrl?: string }): BrowserHistoryEntry {
    this.db
      .prepare(
        `INSERT INTO browser_history (id, space_id, url, title, favicon_url)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(space_id, url) DO UPDATE SET
           visit_count = visit_count + 1,
           title = COALESCE(excluded.title, browser_history.title),
           favicon_url = COALESCE(excluded.favicon_url, browser_history.favicon_url),
           last_visited_at = datetime('now')`,
      )
      .run(randomUUID(), input.spaceId, input.url, input.title ?? null, input.faviconUrl ?? null)

    const row = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM browser_history WHERE space_id = ? AND url = ?`)
      .get(input.spaceId, input.url) as HistoryRow | undefined

    if (!row) {
      throw new Error('History entry recorded but could not be retrieved')
    }
    return mapRow(row)
  }

  listForSpace(spaceId: UUID, options?: { limit?: number; before?: string }): BrowserHistoryEntry[] {
    const limit = options?.limit ?? 200
    if (options?.before) {
      const rows = this.db
        .prepare(
          `SELECT ${SELECT_COLUMNS}
           FROM browser_history
           WHERE space_id = ? AND last_visited_at < ?
           ORDER BY last_visited_at DESC
           LIMIT ?`,
        )
        .all(spaceId, options.before, limit) as HistoryRow[]
      return rows.map(mapRow)
    }

    const rows = this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM browser_history
         WHERE space_id = ?
         ORDER BY last_visited_at DESC
         LIMIT ?`,
      )
      .all(spaceId, limit) as HistoryRow[]

    return rows.map(mapRow)
  }

  search(spaceId: UUID, query: string, limit = 20): BrowserHistoryEntry[] {
    const pattern = `%${query}%`
    const rows = this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM browser_history
         WHERE space_id = ? AND (url LIKE ? OR title LIKE ?)
         ORDER BY visit_count DESC, last_visited_at DESC
         LIMIT ?`,
      )
      .all(spaceId, pattern, pattern, limit) as HistoryRow[]

    return rows.map(mapRow)
  }

  topSites(spaceId: UUID, limit = 8): BrowserHistoryEntry[] {
    const rows = this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM browser_history
         WHERE space_id = ?
         ORDER BY visit_count DESC, last_visited_at DESC
         LIMIT ?`,
      )
      .all(spaceId, limit) as HistoryRow[]

    return rows.map(mapRow)
  }

  delete(id: UUID): void {
    this.db.prepare(`DELETE FROM browser_history WHERE id = ?`).run(id)
  }

  clearForSpace(spaceId: UUID): void {
    this.db.prepare(`DELETE FROM browser_history WHERE space_id = ?`).run(spaceId)
  }
}

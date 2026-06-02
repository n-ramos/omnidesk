import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import type { BrowserBookmark, UUID } from '@shared/models'

interface BookmarkRow {
  id: string
  space_id: string
  category_id: string | null
  title: string
  url: string
  favicon_url: string | null
  position_index: number
  created_at: string
  updated_at: string
}

const mapRow = (row: BookmarkRow): BrowserBookmark => ({
  id: row.id,
  spaceId: row.space_id,
  categoryId: row.category_id,
  title: row.title,
  url: row.url,
  faviconUrl: row.favicon_url ?? undefined,
  positionIndex: row.position_index,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

interface CreateBookmarkRow {
  spaceId: UUID
  categoryId?: UUID | null
  title: string
  url: string
  faviconUrl?: string
}

const SELECT_COLUMNS = `id, space_id, category_id, title, url, favicon_url,
  position_index, created_at, updated_at`

export class BrowserBookmarkRepository {
  constructor(private readonly db: Database) {}

  listForSpace(spaceId: UUID): BrowserBookmark[] {
    const rows = this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM browser_bookmarks
         WHERE space_id = ?
         ORDER BY position_index ASC, created_at ASC`,
      )
      .all(spaceId) as BookmarkRow[]

    return rows.map(mapRow)
  }

  get(id: UUID): BrowserBookmark | undefined {
    const row = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM browser_bookmarks WHERE id = ?`)
      .get(id) as BookmarkRow | undefined

    return row ? mapRow(row) : undefined
  }

  create(input: CreateBookmarkRow): BrowserBookmark {
    const id = randomUUID()
    const position = this.db
      .prepare(
        `SELECT COALESCE(MAX(position_index) + 1, 0) AS next
         FROM browser_bookmarks WHERE space_id = ?`,
      )
      .get(input.spaceId) as { next: number }

    this.db
      .prepare(
        `INSERT INTO browser_bookmarks (id, space_id, category_id, title, url, favicon_url, position_index)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.spaceId,
        input.categoryId ?? null,
        input.title,
        input.url,
        input.faviconUrl ?? null,
        position.next,
      )

    const created = this.get(id)
    if (!created) {
      throw new Error('Bookmark created but could not be retrieved')
    }
    return created
  }

  update(input: {
    id: UUID
    title?: string
    url?: string
    faviconUrl?: string
    categoryId?: UUID | null
  }): BrowserBookmark {
    const fields: string[] = []
    const values: Array<string | null> = []

    if (input.title !== undefined) {
      fields.push('title = ?')
      values.push(input.title)
    }
    if (input.url !== undefined) {
      fields.push('url = ?')
      values.push(input.url)
    }
    if (input.faviconUrl !== undefined) {
      fields.push('favicon_url = ?')
      values.push(input.faviconUrl || null)
    }
    if (input.categoryId !== undefined) {
      fields.push('category_id = ?')
      values.push(input.categoryId)
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')")
      values.push(input.id)
      this.db.prepare(`UPDATE browser_bookmarks SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }

    const updated = this.get(input.id)
    if (!updated) {
      throw new Error('Bookmark not found after update')
    }
    return updated
  }

  reorder(spaceId: UUID, ids: UUID[]): BrowserBookmark[] {
    const update = this.db.prepare(
      `UPDATE browser_bookmarks
       SET position_index = ?, updated_at = datetime('now')
       WHERE id = ? AND space_id = ?`,
    )
    const txn = this.db.transaction((orderedIds: UUID[]) => {
      orderedIds.forEach((id, index) => update.run(index, id, spaceId))
    })
    txn(ids)
    return this.listForSpace(spaceId)
  }

  delete(id: UUID): void {
    this.db.prepare(`DELETE FROM browser_bookmarks WHERE id = ?`).run(id)
  }
}

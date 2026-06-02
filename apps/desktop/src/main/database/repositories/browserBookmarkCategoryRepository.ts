import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import type { BrowserBookmarkCategory, UUID } from '@shared/models'

interface CategoryRow {
  id: string
  space_id: string
  name: string
  position_index: number
  created_at: string
  updated_at: string
}

const mapRow = (row: CategoryRow): BrowserBookmarkCategory => ({
  id: row.id,
  spaceId: row.space_id,
  name: row.name,
  positionIndex: row.position_index,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const SELECT_COLUMNS = `id, space_id, name, position_index, created_at, updated_at`

export class BrowserBookmarkCategoryRepository {
  constructor(private readonly db: Database) {}

  listForSpace(spaceId: UUID): BrowserBookmarkCategory[] {
    const rows = this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM browser_bookmark_categories
         WHERE space_id = ?
         ORDER BY position_index ASC, created_at ASC`,
      )
      .all(spaceId) as CategoryRow[]

    return rows.map(mapRow)
  }

  get(id: UUID): BrowserBookmarkCategory | undefined {
    const row = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM browser_bookmark_categories WHERE id = ?`)
      .get(id) as CategoryRow | undefined

    return row ? mapRow(row) : undefined
  }

  create(spaceId: UUID, name: string): BrowserBookmarkCategory {
    const id = randomUUID()
    const position = this.db
      .prepare(
        `SELECT COALESCE(MAX(position_index) + 1, 0) AS next
         FROM browser_bookmark_categories WHERE space_id = ?`,
      )
      .get(spaceId) as { next: number }

    this.db
      .prepare(
        `INSERT INTO browser_bookmark_categories (id, space_id, name, position_index)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, spaceId, name, position.next)

    const created = this.get(id)
    if (!created) {
      throw new Error('Bookmark category created but could not be retrieved')
    }
    return created
  }

  update(id: UUID, name: string): BrowserBookmarkCategory {
    this.db
      .prepare(
        `UPDATE browser_bookmark_categories SET name = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .run(name, id)

    const updated = this.get(id)
    if (!updated) {
      throw new Error('Bookmark category not found after update')
    }
    return updated
  }

  reorder(spaceId: UUID, ids: UUID[]): BrowserBookmarkCategory[] {
    const update = this.db.prepare(
      `UPDATE browser_bookmark_categories
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
    this.db.prepare(`DELETE FROM browser_bookmark_categories WHERE id = ?`).run(id)
  }
}

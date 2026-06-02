import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import type { BrowserTabGroup, UUID } from '@shared/models'

interface TabGroupRow {
  id: string
  space_id: string
  name: string
  color: string | null
  position_index: number
  is_collapsed: number
  created_at: string
  updated_at: string
}

const mapRow = (row: TabGroupRow): BrowserTabGroup => ({
  id: row.id,
  spaceId: row.space_id,
  name: row.name,
  color: row.color ?? undefined,
  positionIndex: row.position_index,
  isCollapsed: row.is_collapsed === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const SELECT_COLUMNS = `id, space_id, name, color, position_index, is_collapsed, created_at, updated_at`

export class BrowserTabGroupRepository {
  constructor(private readonly db: Database) {}

  listForSpace(spaceId: UUID): BrowserTabGroup[] {
    const rows = this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM browser_tab_groups
         WHERE space_id = ?
         ORDER BY position_index ASC, created_at ASC`,
      )
      .all(spaceId) as TabGroupRow[]

    return rows.map(mapRow)
  }

  get(id: UUID): BrowserTabGroup | undefined {
    const row = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM browser_tab_groups WHERE id = ?`)
      .get(id) as TabGroupRow | undefined

    return row ? mapRow(row) : undefined
  }

  create(spaceId: UUID, name: string, color?: string): BrowserTabGroup {
    const id = randomUUID()
    const position = this.db
      .prepare(
        `SELECT COALESCE(MAX(position_index) + 1, 0) AS next
         FROM browser_tab_groups WHERE space_id = ?`,
      )
      .get(spaceId) as { next: number }

    this.db
      .prepare(
        `INSERT INTO browser_tab_groups (id, space_id, name, color, position_index)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, spaceId, name, color ?? null, position.next)

    const created = this.get(id)
    if (!created) {
      throw new Error('Tab group created but could not be retrieved')
    }
    return created
  }

  update(input: { id: UUID; name?: string; color?: string; isCollapsed?: boolean }): BrowserTabGroup {
    const fields: string[] = []
    const values: Array<string | number | null> = []

    if (input.name !== undefined) {
      fields.push('name = ?')
      values.push(input.name)
    }
    if (input.color !== undefined) {
      fields.push('color = ?')
      values.push(input.color || null)
    }
    if (input.isCollapsed !== undefined) {
      fields.push('is_collapsed = ?')
      values.push(input.isCollapsed ? 1 : 0)
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')")
      values.push(input.id)
      this.db.prepare(`UPDATE browser_tab_groups SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }

    const updated = this.get(input.id)
    if (!updated) {
      throw new Error('Tab group not found after update')
    }
    return updated
  }

  reorder(spaceId: UUID, ids: UUID[]): BrowserTabGroup[] {
    const update = this.db.prepare(
      `UPDATE browser_tab_groups
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
    this.db.prepare(`DELETE FROM browser_tab_groups WHERE id = ?`).run(id)
  }
}

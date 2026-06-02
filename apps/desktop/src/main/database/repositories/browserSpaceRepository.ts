import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import type { BrowserSpace, UUID } from '@shared/models'

interface BrowserSpaceRow {
  id: string
  name: string
  icon: string | null
  color: string | null
  partition_key: string
  ad_block: number
  position_index: number
  is_active: number
  created_at: string
  updated_at: string
}

const mapRow = (row: BrowserSpaceRow): BrowserSpace => ({
  id: row.id,
  name: row.name,
  icon: row.icon ?? undefined,
  color: row.color ?? undefined,
  partitionKey: row.partition_key,
  adBlock: row.ad_block === 1,
  positionIndex: row.position_index,
  isActive: row.is_active === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

interface CreateSpaceRow {
  id: UUID
  name: string
  icon?: string
  color?: string
  partitionKey: string
}

const SELECT_COLUMNS = `id, name, icon, color, partition_key, ad_block,
  position_index, is_active, created_at, updated_at`

export class BrowserSpaceRepository {
  constructor(private readonly db: Database) {}

  list(): BrowserSpace[] {
    const rows = this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM browser_spaces
         ORDER BY position_index ASC, created_at ASC`,
      )
      .all() as BrowserSpaceRow[]

    return rows.map(mapRow)
  }

  get(id: UUID): BrowserSpace | undefined {
    const row = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM browser_spaces WHERE id = ?`)
      .get(id) as BrowserSpaceRow | undefined

    return row ? mapRow(row) : undefined
  }

  partitionKey(id: UUID): string | undefined {
    const row = this.db
      .prepare(`SELECT partition_key FROM browser_spaces WHERE id = ?`)
      .get(id) as { partition_key: string } | undefined

    return row?.partition_key
  }

  create(input: CreateSpaceRow): BrowserSpace {
    const id = input.id || randomUUID()
    const position = this.db
      .prepare(`SELECT COALESCE(MAX(position_index) + 1, 0) AS next FROM browser_spaces`)
      .get() as { next: number }

    this.db
      .prepare(
        `INSERT INTO browser_spaces (id, name, icon, color, partition_key, position_index)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.name, input.icon ?? null, input.color ?? null, input.partitionKey, position.next)

    const created = this.get(id)
    if (!created) {
      throw new Error('Browser space created but could not be retrieved')
    }
    return created
  }

  update(input: { id: UUID; name?: string; icon?: string; color?: string }): BrowserSpace {
    const fields: string[] = []
    const values: Array<string | null> = []

    if (input.name !== undefined) {
      fields.push('name = ?')
      values.push(input.name)
    }
    if (input.icon !== undefined) {
      fields.push('icon = ?')
      values.push(input.icon || null)
    }
    if (input.color !== undefined) {
      fields.push('color = ?')
      values.push(input.color || null)
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')")
      values.push(input.id)
      this.db.prepare(`UPDATE browser_spaces SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }

    const updated = this.get(input.id)
    if (!updated) {
      throw new Error('Browser space not found after update')
    }
    return updated
  }

  setActive(id: UUID): void {
    const txn = this.db.transaction((targetId: UUID) => {
      this.db.prepare(`UPDATE browser_spaces SET is_active = 0 WHERE is_active = 1`).run()
      this.db
        .prepare(`UPDATE browser_spaces SET is_active = 1, updated_at = datetime('now') WHERE id = ?`)
        .run(targetId)
    })
    txn(id)
  }

  setFilterFlags(id: UUID, flags: { adBlock?: boolean }): BrowserSpace {
    const fields: string[] = []
    const values: Array<number> = []

    if (flags.adBlock !== undefined) {
      fields.push('ad_block = ?')
      values.push(flags.adBlock ? 1 : 0)
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')")
      this.db
        .prepare(`UPDATE browser_spaces SET ${fields.join(', ')} WHERE id = ?`)
        .run(...values, id)
    }

    const updated = this.get(id)
    if (!updated) {
      throw new Error('Browser space not found after flag update')
    }
    return updated
  }

  reorder(ids: UUID[]): BrowserSpace[] {
    const update = this.db.prepare(
      `UPDATE browser_spaces SET position_index = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    const txn = this.db.transaction((orderedIds: UUID[]) => {
      orderedIds.forEach((id, index) => update.run(index, id))
    })
    txn(ids)
    return this.list()
  }

  delete(id: UUID): void {
    this.db.prepare(`DELETE FROM browser_spaces WHERE id = ?`).run(id)
  }
}

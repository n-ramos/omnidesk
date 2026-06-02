import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import type { BrowserExtension, UUID } from '@shared/models'

interface ExtensionRow {
  id: string
  path: string
  name: string
  version: string | null
  is_enabled: number
  created_at: string
  updated_at: string
}

const mapRow = (row: ExtensionRow): BrowserExtension => ({
  id: row.id,
  path: row.path,
  name: row.name,
  version: row.version ?? undefined,
  isEnabled: row.is_enabled === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const SELECT_COLUMNS = `id, path, name, version, is_enabled, created_at, updated_at`

export class BrowserExtensionRepository {
  constructor(private readonly db: Database) {}

  list(): BrowserExtension[] {
    const rows = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM browser_extensions ORDER BY created_at ASC`)
      .all() as ExtensionRow[]

    return rows.map(mapRow)
  }

  get(id: UUID): BrowserExtension | undefined {
    const row = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM browser_extensions WHERE id = ?`)
      .get(id) as ExtensionRow | undefined

    return row ? mapRow(row) : undefined
  }

  findByPath(path: string): BrowserExtension | undefined {
    const row = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM browser_extensions WHERE path = ?`)
      .get(path) as ExtensionRow | undefined

    return row ? mapRow(row) : undefined
  }

  create(input: { path: string; name: string; version?: string }): BrowserExtension {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO browser_extensions (id, path, name, version)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
           name = excluded.name,
           version = excluded.version,
           is_enabled = 1,
           updated_at = datetime('now')`,
      )
      .run(id, input.path, input.name, input.version ?? null)

    const created = this.findByPath(input.path)
    if (!created) {
      throw new Error('Extension created but could not be retrieved')
    }
    return created
  }

  setEnabled(id: UUID, enabled: boolean): BrowserExtension {
    this.db
      .prepare(
        `UPDATE browser_extensions SET is_enabled = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .run(enabled ? 1 : 0, id)

    const updated = this.get(id)
    if (!updated) {
      throw new Error('Extension not found after update')
    }
    return updated
  }

  delete(id: UUID): void {
    this.db.prepare(`DELETE FROM browser_extensions WHERE id = ?`).run(id)
  }
}

import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import type { BrowserTab, UUID } from '@shared/models'

interface TabRow {
  id: string
  space_id: string
  group_id: string | null
  url: string
  title: string | null
  custom_title: string | null
  favicon_url: string | null
  position_index: number
  is_pinned: number
  is_active: number
  last_active_at: string
}

const mapRow = (row: TabRow): BrowserTab => ({
  id: row.id,
  spaceId: row.space_id,
  groupId: row.group_id,
  url: row.url,
  title: row.title ?? undefined,
  customTitle: row.custom_title ?? undefined,
  faviconUrl: row.favicon_url ?? undefined,
  positionIndex: row.position_index,
  isPinned: row.is_pinned === 1,
  isActive: row.is_active === 1,
  lastActiveAt: row.last_active_at,
})

interface UpsertTabRow {
  id?: UUID
  spaceId: UUID
  groupId?: UUID | null
  url: string
  title?: string
  customTitle?: string | null
  faviconUrl?: string
  isPinned?: boolean
  isActive?: boolean
}

const SELECT_COLUMNS = `id, space_id, group_id, url, title, custom_title, favicon_url, position_index,
  is_pinned, is_active, last_active_at`

export class BrowserTabRepository {
  constructor(private readonly db: Database) {}

  listForSpace(spaceId: UUID): BrowserTab[] {
    const rows = this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM browser_tabs
         WHERE space_id = ?
         ORDER BY is_pinned DESC, position_index ASC`,
      )
      .all(spaceId) as TabRow[]

    return rows.map(mapRow)
  }

  get(id: UUID): BrowserTab | undefined {
    const row = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM browser_tabs WHERE id = ?`)
      .get(id) as TabRow | undefined

    return row ? mapRow(row) : undefined
  }

  upsert(input: UpsertTabRow): BrowserTab {
    if (input.id && this.get(input.id)) {
      const fields: string[] = ['url = ?']
      const values: Array<string | number | null> = [input.url]

      if (input.title !== undefined) {
        fields.push('title = ?')
        values.push(input.title || null)
      }
      if (input.customTitle !== undefined) {
        fields.push('custom_title = ?')
        values.push(input.customTitle || null)
      }
      if (input.faviconUrl !== undefined) {
        fields.push('favicon_url = ?')
        values.push(input.faviconUrl || null)
      }
      if (input.isPinned !== undefined) {
        fields.push('is_pinned = ?')
        values.push(input.isPinned ? 1 : 0)
      }
      if (input.isActive !== undefined) {
        fields.push('is_active = ?')
        values.push(input.isActive ? 1 : 0)
        if (input.isActive) {
          fields.push("last_active_at = datetime('now')")
        }
      }
      if (input.groupId !== undefined) {
        fields.push('group_id = ?')
        values.push(input.groupId)
      }

      fields.push("updated_at = datetime('now')")
      values.push(input.id)
      this.db.prepare(`UPDATE browser_tabs SET ${fields.join(', ')} WHERE id = ?`).run(...values)

      const updated = this.get(input.id)
      if (!updated) {
        throw new Error('Tab not found after update')
      }
      return updated
    }

    const id = input.id || randomUUID()
    const position = this.db
      .prepare(`SELECT COALESCE(MAX(position_index) + 1, 0) AS next FROM browser_tabs WHERE space_id = ?`)
      .get(input.spaceId) as { next: number }

    this.db
      .prepare(
        `INSERT INTO browser_tabs (id, space_id, group_id, url, title, custom_title, favicon_url, position_index, is_pinned, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.spaceId,
        input.groupId ?? null,
        input.url,
        input.title ?? null,
        input.customTitle ?? null,
        input.faviconUrl ?? null,
        position.next,
        input.isPinned ? 1 : 0,
        input.isActive ? 1 : 0,
      )

    const created = this.get(id)
    if (!created) {
      throw new Error('Tab created but could not be retrieved')
    }
    return created
  }

  setActive(spaceId: UUID, tabId: UUID): void {
    const txn = this.db.transaction((space: UUID, tab: UUID) => {
      this.db.prepare(`UPDATE browser_tabs SET is_active = 0 WHERE space_id = ?`).run(space)
      this.db
        .prepare(
          `UPDATE browser_tabs
           SET is_active = 1, last_active_at = datetime('now'), updated_at = datetime('now')
           WHERE id = ?`,
        )
        .run(tab)
    })
    txn(spaceId, tabId)
  }

  reorder(spaceId: UUID, ids: UUID[]): BrowserTab[] {
    const update = this.db.prepare(
      `UPDATE browser_tabs
       SET position_index = ?, updated_at = datetime('now')
       WHERE id = ? AND space_id = ?`,
    )
    const txn = this.db.transaction((orderedIds: UUID[]) => {
      orderedIds.forEach((id, index) => update.run(index, id, spaceId))
    })
    txn(ids)
    return this.listForSpace(spaceId)
  }

  setGroup(tabId: UUID, groupId: UUID | null): BrowserTab | undefined {
    this.db
      .prepare(`UPDATE browser_tabs SET group_id = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(groupId, tabId)
    return this.get(tabId)
  }

  // Surnom utilisateur. Chaine vide ou null => on efface l'override (retour au titre de page).
  setCustomTitle(tabId: UUID, customTitle: string | null): BrowserTab | undefined {
    this.db
      .prepare(`UPDATE browser_tabs SET custom_title = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(customTitle || null, tabId)
    return this.get(tabId)
  }

  clearGroup(groupId: UUID): void {
    this.db
      .prepare(`UPDATE browser_tabs SET group_id = NULL, updated_at = datetime('now') WHERE group_id = ?`)
      .run(groupId)
  }

  close(id: UUID): void {
    this.db.prepare(`DELETE FROM browser_tabs WHERE id = ?`).run(id)
  }

  closeAllForSpace(spaceId: UUID): void {
    this.db.prepare(`DELETE FROM browser_tabs WHERE space_id = ?`).run(spaceId)
  }
}

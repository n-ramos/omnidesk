import type { Database } from 'better-sqlite3'
import type { ISODateString, UUID } from '@shared/models'

interface PassFolderRow {
  id: string
  parent_id: string | null
  name_enc: string
  icon: string | null
  position: number
  created_at: string
  updated_at: string
}

// Dossier stocke : le nom reste CHIFFRE (nameEnc). Le repository ne dechiffre jamais ; c'est le
// service qui chiffre/dechiffre (il detient la cle).
export interface StoredPassFolder {
  id: UUID
  parentId: UUID | null
  nameEnc: string
  icon: string | null
  position: number
  createdAt: ISODateString
  updatedAt: ISODateString
}

export interface CreatePassFolderRow {
  id: UUID
  parentId: UUID | null
  nameEnc: string
  icon: string | null
}

// undefined = colonne inchangee ; null = colonne mise a NULL (parent_id null = racine).
export interface UpdatePassFolderRow {
  id: UUID
  nameEnc?: string
  parentId?: UUID | null
  icon?: string | null
}

const SELECT_COLUMNS = 'id, parent_id, name_enc, icon, position, created_at, updated_at'

const mapRow = (row: PassFolderRow): StoredPassFolder => ({
  id: row.id,
  parentId: row.parent_id,
  nameEnc: row.name_enc,
  icon: row.icon,
  position: row.position,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export class PassFolderRepository {
  constructor(private readonly db: Database) {}

  list(): StoredPassFolder[] {
    const rows = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM pass_folders ORDER BY position ASC, created_at ASC`)
      .all() as PassFolderRow[]
    return rows.map(mapRow)
  }

  get(id: UUID): StoredPassFolder | undefined {
    const row = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM pass_folders WHERE id = ?`)
      .get(id) as PassFolderRow | undefined
    return row ? mapRow(row) : undefined
  }

  create(input: CreatePassFolderRow): StoredPassFolder {
    this.db
      .prepare(
        'INSERT INTO pass_folders (id, parent_id, name_enc, icon, position) VALUES (?, ?, ?, ?, ?)',
      )
      .run(input.id, input.parentId, input.nameEnc, input.icon, this.nextPosition(input.parentId))
    const created = this.get(input.id)
    if (!created) {
      throw new Error('Pass folder created but could not be retrieved')
    }
    return created
  }

  update(input: UpdatePassFolderRow): StoredPassFolder {
    const sets: string[] = []
    const values: unknown[] = []
    const assign = (column: string, value: unknown): void => {
      sets.push(`${column} = ?`)
      values.push(value)
    }

    if (input.nameEnc !== undefined) assign('name_enc', input.nameEnc)
    if (input.parentId !== undefined) assign('parent_id', input.parentId)
    if (input.icon !== undefined) assign('icon', input.icon)

    if (sets.length > 0) {
      sets.push("updated_at = datetime('now')")
      values.push(input.id)
      this.db.prepare(`UPDATE pass_folders SET ${sets.join(', ')} WHERE id = ?`).run(...values)
    }

    const updated = this.get(input.id)
    if (!updated) {
      throw new Error('Pass folder not found after update')
    }
    return updated
  }

  delete(id: UUID): void {
    this.db.prepare('DELETE FROM pass_folders WHERE id = ?').run(id)
  }

  // Rattache les sous-dossiers directs d'un dossier a un autre parent (ou racine si null).
  // Utilise lors de la suppression non destructive (les sous-dossiers remontent au parent).
  reparentChildren(fromParentId: UUID, toParentId: UUID | null): void {
    this.db
      .prepare(
        "UPDATE pass_folders SET parent_id = ?, updated_at = datetime('now') WHERE parent_id = ?",
      )
      .run(toParentId, fromParentId)
  }

  reorder(ids: UUID[]): void {
    const update = this.db.prepare(
      "UPDATE pass_folders SET position = ?, updated_at = datetime('now') WHERE id = ?",
    )
    const txn = this.db.transaction((orderedIds: UUID[]) => {
      orderedIds.forEach((id, index) => update.run(index, id))
    })
    txn(ids)
  }

  // Position suivante (MAX+1) parmi les dossiers freres (meme parent ; NULL = racine).
  private nextPosition(parentId: UUID | null): number {
    const row = (
      parentId === null
        ? this.db
            .prepare(
              "SELECT COALESCE(MAX(position) + 1, 0) AS next FROM pass_folders WHERE parent_id IS NULL",
            )
            .get()
        : this.db
            .prepare(
              "SELECT COALESCE(MAX(position) + 1, 0) AS next FROM pass_folders WHERE parent_id = ?",
            )
            .get(parentId)
    ) as { next: number }
    return row.next
  }
}

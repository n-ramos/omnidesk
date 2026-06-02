import type { Database } from 'better-sqlite3'
import type { ISODateString, UUID } from '@shared/models'

interface PassEntryRow {
  id: string
  folder_id: string | null
  title_enc: string
  username_enc: string | null
  url_enc: string | null
  password_enc: string
  notes_enc: string | null
  icon: string | null
  favorite: number
  position: number
  pwd_changed_at: string | null
  created_at: string
  updated_at: string
}

// Entree telle qu'elle est stockee : les champs sensibles restent CHIFFRES (suffixe Enc). Le
// repository ne dechiffre jamais (il n'a pas la cle) ; c'est le service qui chiffre/dechiffre.
export interface StoredPassEntry {
  id: UUID
  folderId: UUID | null
  titleEnc: string
  usernameEnc: string | null
  urlEnc: string | null
  passwordEnc: string
  notesEnc: string | null
  icon: string | null
  favorite: boolean
  position: number
  passwordUpdatedAt: ISODateString | null
  createdAt: ISODateString
  updatedAt: ISODateString
}

// L'id est fourni par le service (et non genere ici) car il sert d'AAD au chiffrement des champs
// AVANT l'insertion : il doit donc etre connu en amont.
export interface CreatePassEntryRow {
  id: UUID
  folderId: UUID | null
  titleEnc: string
  usernameEnc: string | null
  urlEnc: string | null
  passwordEnc: string
  notesEnc: string | null
  icon: string | null
  passwordUpdatedAt: ISODateString | null
}

// undefined = colonne inchangee ; null = colonne mise a NULL.
export interface UpdatePassEntryRow {
  id: UUID
  folderId?: UUID | null
  titleEnc?: string
  usernameEnc?: string | null
  urlEnc?: string | null
  passwordEnc?: string
  notesEnc?: string | null
  icon?: string | null
  favorite?: boolean
  passwordUpdatedAt?: string | null
}

const SELECT_COLUMNS =
  'id, folder_id, title_enc, username_enc, url_enc, password_enc, notes_enc, icon, favorite, position, pwd_changed_at, created_at, updated_at'

const mapRow = (row: PassEntryRow): StoredPassEntry => ({
  id: row.id,
  folderId: row.folder_id,
  titleEnc: row.title_enc,
  usernameEnc: row.username_enc,
  urlEnc: row.url_enc,
  passwordEnc: row.password_enc,
  notesEnc: row.notes_enc,
  icon: row.icon,
  favorite: row.favorite === 1,
  position: row.position,
  passwordUpdatedAt: row.pwd_changed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export class PassEntryRepository {
  constructor(private readonly db: Database) {}

  list(): StoredPassEntry[] {
    const rows = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM pass_entries ORDER BY position ASC, created_at ASC`)
      .all() as PassEntryRow[]
    return rows.map(mapRow)
  }

  get(id: UUID): StoredPassEntry | undefined {
    const row = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM pass_entries WHERE id = ?`)
      .get(id) as PassEntryRow | undefined
    return row ? mapRow(row) : undefined
  }

  create(input: CreatePassEntryRow): StoredPassEntry {
    this.db
      .prepare(
        `INSERT INTO pass_entries
           (id, folder_id, title_enc, username_enc, url_enc, password_enc, notes_enc, icon, position, pwd_changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.folderId,
        input.titleEnc,
        input.usernameEnc,
        input.urlEnc,
        input.passwordEnc,
        input.notesEnc,
        input.icon,
        this.nextPosition(input.folderId),
        input.passwordUpdatedAt,
      )
    const created = this.get(input.id)
    if (!created) {
      throw new Error('Pass entry created but could not be retrieved')
    }
    return created
  }

  update(input: UpdatePassEntryRow): StoredPassEntry {
    const sets: string[] = []
    const values: unknown[] = []
    const assign = (column: string, value: unknown): void => {
      sets.push(`${column} = ?`)
      values.push(value)
    }

    if (input.folderId !== undefined) assign('folder_id', input.folderId)
    if (input.titleEnc !== undefined) assign('title_enc', input.titleEnc)
    if (input.usernameEnc !== undefined) assign('username_enc', input.usernameEnc)
    if (input.urlEnc !== undefined) assign('url_enc', input.urlEnc)
    if (input.passwordEnc !== undefined) assign('password_enc', input.passwordEnc)
    if (input.notesEnc !== undefined) assign('notes_enc', input.notesEnc)
    if (input.icon !== undefined) assign('icon', input.icon)
    if (input.favorite !== undefined) assign('favorite', input.favorite ? 1 : 0)
    if (input.passwordUpdatedAt !== undefined) assign('pwd_changed_at', input.passwordUpdatedAt)

    if (sets.length > 0) {
      sets.push("updated_at = datetime('now')")
      values.push(input.id)
      this.db.prepare(`UPDATE pass_entries SET ${sets.join(', ')} WHERE id = ?`).run(...values)
    }

    const updated = this.get(input.id)
    if (!updated) {
      throw new Error('Pass entry not found after update')
    }
    return updated
  }

  delete(id: UUID): void {
    this.db.prepare('DELETE FROM pass_entries WHERE id = ?').run(id)
  }

  // Reindexe sequentiellement les positions dans l'ordre fourni (transaction). Les ids sont
  // ceux d'un meme dossier (le service garantit le perimetre).
  reorder(ids: UUID[]): void {
    const update = this.db.prepare(
      "UPDATE pass_entries SET position = ?, updated_at = datetime('now') WHERE id = ?",
    )
    const txn = this.db.transaction((orderedIds: UUID[]) => {
      orderedIds.forEach((id, index) => update.run(index, id))
    })
    txn(ids)
  }

  // Rattache toutes les entrees d'un dossier a un autre dossier (ou a la racine si null).
  reparentEntries(fromFolderId: UUID, toFolderId: UUID | null): void {
    this.db
      .prepare(
        "UPDATE pass_entries SET folder_id = ?, updated_at = datetime('now') WHERE folder_id = ?",
      )
      .run(toFolderId, fromFolderId)
  }

  // Position suivante (MAX+1) parmi les entrees du meme dossier (NULL = racine).
  private nextPosition(folderId: UUID | null): number {
    const row = (
      folderId === null
        ? this.db
            .prepare(
              "SELECT COALESCE(MAX(position) + 1, 0) AS next FROM pass_entries WHERE folder_id IS NULL",
            )
            .get()
        : this.db
            .prepare(
              "SELECT COALESCE(MAX(position) + 1, 0) AS next FROM pass_entries WHERE folder_id = ?",
            )
            .get(folderId)
    ) as { next: number }
    return row.next
  }
}

import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import type { BrowserCredential, UUID } from '@shared/models'

interface CredentialRow {
  id: string
  origin: string
  username: string
  password_b64: string
  created_at: string
  updated_at: string
}

// Vue interne pour l'autofill : le mot de passe est encore chiffre (b64). Le service le dechiffre.
export interface StoredCredential {
  id: UUID
  username: string
  passwordB64: string
}

const mapMeta = (row: CredentialRow): BrowserCredential => ({
  id: row.id,
  origin: row.origin,
  username: row.username,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const SELECT_COLUMNS = 'id, origin, username, password_b64, created_at, updated_at'

export class BrowserCredentialRepository {
  constructor(private readonly db: Database) {}

  get(id: UUID): BrowserCredential | undefined {
    const row = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM browser_credentials WHERE id = ?`)
      .get(id) as CredentialRow | undefined
    return row ? mapMeta(row) : undefined
  }

  // Cle (origine, login) : on remplace le mot de passe s'il change, sinon on cree l'entree.
  upsert(input: { origin: string; username: string; passwordB64: string }): BrowserCredential {
    const existing = this.db
      .prepare('SELECT id FROM browser_credentials WHERE origin = ? AND username = ?')
      .get(input.origin, input.username) as { id: string } | undefined

    const id = existing?.id ?? randomUUID()
    if (existing) {
      this.db
        .prepare(
          `UPDATE browser_credentials SET password_b64 = ?, updated_at = datetime('now') WHERE id = ?`,
        )
        .run(input.passwordB64, id)
    } else {
      this.db
        .prepare(
          'INSERT INTO browser_credentials (id, origin, username, password_b64) VALUES (?, ?, ?, ?)',
        )
        .run(id, input.origin, input.username, input.passwordB64)
    }

    const saved = this.get(id)
    if (!saved) {
      throw new Error('Credential not found after upsert')
    }
    return saved
  }

  // Comptes connus pour une origine, plus recemment utilises d'abord (pour l'autofill).
  getForOrigin(origin: string): StoredCredential[] {
    const rows = this.db
      .prepare(
        'SELECT id, username, password_b64 FROM browser_credentials WHERE origin = ? ORDER BY updated_at DESC',
      )
      .all(origin) as Array<{ id: string; username: string; password_b64: string }>
    return rows.map((row) => ({ id: row.id, username: row.username, passwordB64: row.password_b64 }))
  }

  list(): BrowserCredential[] {
    const rows = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM browser_credentials ORDER BY origin ASC, updated_at DESC`)
      .all() as CredentialRow[]
    return rows.map(mapMeta)
  }

  delete(id: UUID): void {
    this.db.prepare('DELETE FROM browser_credentials WHERE id = ?').run(id)
  }
}

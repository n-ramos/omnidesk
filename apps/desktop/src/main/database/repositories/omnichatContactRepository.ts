import type { Database } from 'better-sqlite3'

// Contacts omnichat persistants (modele sans annuaire global) : on ne connait un pair
// que si on l'a explicitement ajoute par son identifiant (le "hash" = UUID) et un
// pseudo saisi localement. L'etat en ligne est ephemere (gere par SignalingClient via
// la presence du serveur) et n'est donc PAS stocke ici.
export interface StoredOmnichatContact {
  id: string
  pseudo: string
  addedAt: string
}

interface ContactRow {
  user_id: string
  pseudo: string
  added_at: string
}

const mapRow = (row: ContactRow): StoredOmnichatContact => ({
  id: row.user_id,
  pseudo: row.pseudo,
  addedAt: row.added_at,
})

export class OmnichatContactRepository {
  constructor(private readonly db: Database) {}

  // Normalise l'identifiant comme partout ailleurs (routage WS, cles DM, membres) :
  // lowercase, pour que la jointure avec la presence (onlineIds) corresponde.
  private normalizeId(userId: string): string {
    return userId.trim().toLowerCase()
  }

  // Ajoute un contact (ou met a jour son pseudo s'il existe deja). Renvoie le contact stocke.
  add(userId: string, pseudo: string): StoredOmnichatContact {
    const id = this.normalizeId(userId)
    const trimmedPseudo = pseudo.trim()
    this.db
      .prepare(
        `INSERT INTO omnichat_contacts (user_id, pseudo, added_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET pseudo = excluded.pseudo`,
      )
      .run(id, trimmedPseudo)
    return this.get(id) ?? { id, pseudo: trimmedPseudo, addedAt: '' }
  }

  updatePseudo(userId: string, pseudo: string): void {
    this.db
      .prepare(`UPDATE omnichat_contacts SET pseudo = ? WHERE user_id = ?`)
      .run(pseudo.trim(), this.normalizeId(userId))
  }

  remove(userId: string): void {
    this.db.prepare(`DELETE FROM omnichat_contacts WHERE user_id = ?`).run(this.normalizeId(userId))
  }

  get(userId: string): StoredOmnichatContact | undefined {
    const row = this.db
      .prepare(`SELECT user_id, pseudo, added_at FROM omnichat_contacts WHERE user_id = ?`)
      .get(this.normalizeId(userId)) as ContactRow | undefined
    return row ? mapRow(row) : undefined
  }

  list(): StoredOmnichatContact[] {
    const rows = this.db
      .prepare(
        `SELECT user_id, pseudo, added_at FROM omnichat_contacts ORDER BY pseudo COLLATE NOCASE ASC`,
      )
      .all() as ContactRow[]
    return rows.map(mapRow)
  }
}

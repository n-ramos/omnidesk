import type { Database } from 'better-sqlite3'
import type { ProviderDescriptor, ProviderKind } from '@shared/models'

interface ProviderRow {
  id: ProviderKind
  display_name: string
  kind: ProviderKind
  capabilities: string
}

export class ProviderRepository {
  constructor(private readonly db: Database) {}

  upsertAll(providers: ProviderDescriptor[]): void {
    const statement = this.db.prepare(
      `INSERT INTO providers (id, display_name, kind, capabilities, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        capabilities = excluded.capabilities,
        updated_at = datetime('now')`,
    )

    const transaction = this.db.transaction((items: ProviderDescriptor[]) => {
      for (const provider of items) {
        statement.run(
          provider.id,
          provider.displayName,
          provider.id,
          JSON.stringify(provider.capabilities),
        )
      }

      // La table providers reflete le registry : on purge les providers retires
      // (ex : anciens OAuth Slack/Teams). La FK accounts.provider_id ON DELETE
      // CASCADE nettoie comptes -> conversations -> messages... ; account_secrets
      // n'a pas de FK, on le nettoie explicitement.
      const ids = items.map((item) => item.id)
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(', ')
        this.db.prepare(`DELETE FROM providers WHERE id NOT IN (${placeholders})`).run(...ids)
        this.db
          .prepare(`DELETE FROM account_secrets WHERE provider_id NOT IN (${placeholders})`)
          .run(...ids)
      }
    })

    transaction(providers)
  }

  list(): ProviderDescriptor[] {
    const rows = this.db
      .prepare(
        `SELECT id, display_name, kind, capabilities
         FROM providers
         ORDER BY display_name ASC`,
      )
      .all() as ProviderRow[]

    return rows.map((row) => ({
      id: row.kind,
      name: row.kind,
      displayName: row.display_name,
      capabilities: JSON.parse(row.capabilities) as ProviderDescriptor['capabilities'],
      authReady: false,
    }))
  }
}

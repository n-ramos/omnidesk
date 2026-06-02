import type { Database } from 'better-sqlite3'

interface SettingRow {
  key: string
  value_json: string
}

export class AppSettingsRepository {
  constructor(private readonly db: Database) {}

  get<T>(key: string): T | undefined {
    const row = this.db
      .prepare(`SELECT key, value_json FROM app_settings WHERE key = ?`)
      .get(key) as SettingRow | undefined

    if (!row) {
      return undefined
    }

    try {
      return JSON.parse(row.value_json) as T
    } catch {
      return undefined
    }
  }

  set<T>(key: string, value: T): void {
    const payload = JSON.stringify(value)

    this.db
      .prepare(
        `INSERT INTO app_settings (key, value_json, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`,
      )
      .run(key, payload)
  }

  delete(key: string): void {
    this.db.prepare(`DELETE FROM app_settings WHERE key = ?`).run(key)
  }
}

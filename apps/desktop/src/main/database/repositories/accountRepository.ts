import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type {
  AccountSetupStatus,
  AccountSummary,
  CreateDraftAccountInput,
  ProviderKind,
  UUID,
} from '@shared/models'
import type { ProviderAccountProfile } from '@main/providers/provider.types'

interface AccountRow {
  id: UUID
  provider_id: ProviderKind
  label: string
  external_account_id: string
  email_address?: string
  display_name?: string
  is_enabled: 0 | 1
  setup_status: AccountSetupStatus
  settings_json?: string
  last_sync_at?: string
}

export interface AccountRecord extends AccountSummary {
  settings: Record<string, unknown>
}

interface UpsertConnectedAccountInput {
  providerId: ProviderKind
  profile: ProviderAccountProfile
}

const parseSettings = (settingsJson?: string): Record<string, unknown> => {
  if (!settingsJson) {
    return {}
  }

  try {
    return JSON.parse(settingsJson) as Record<string, unknown>
  } catch {
    return {}
  }
}

const mapRow = (row: AccountRow): AccountRecord => ({
  id: row.id,
  providerId: row.provider_id,
  label: row.label,
  externalAccountId: row.external_account_id,
  emailAddress: row.email_address,
  displayName: row.display_name,
  isEnabled: row.is_enabled === 1,
  setupStatus: row.setup_status,
  lastSyncAt: row.last_sync_at,
  settings: parseSettings(row.settings_json),
})

export class AccountRepository {
  constructor(private readonly db: Database) {}

  private nextPosition(): number {
    const row = this.db
      .prepare(`SELECT COALESCE(MAX(position) + 1, 0) AS next FROM accounts`)
      .get() as { next: number }
    return row.next
  }

  list(): AccountSummary[] {
    const rows = this.db
      .prepare(
        `SELECT
          id,
          provider_id,
          label,
          external_account_id,
          email_address,
          display_name,
          is_enabled,
          setup_status,
          settings_json,
          last_sync_at
         FROM accounts
         ORDER BY position ASC, label ASC`,
      )
      .all() as AccountRow[]

    return rows.map(mapRow)
  }

  get(accountId: UUID): AccountRecord | null {
    const row = this.db
      .prepare(
        `SELECT
          id,
          provider_id,
          label,
          external_account_id,
          email_address,
          display_name,
          is_enabled,
          setup_status,
          settings_json,
          last_sync_at
         FROM accounts
         WHERE id = ?`,
      )
      .get(accountId) as AccountRow | undefined

    return row ? mapRow(row) : null
  }

  createDraft(input: CreateDraftAccountInput): AccountSummary {
    const id = randomUUID()
    const externalAccountId = `local-draft:${id}`
    const setupStatus: AccountSetupStatus = input.providerId === 'imap' ? 'pending_setup' : 'draft'
    const settings = JSON.stringify({
      imapHost: input.imapHost,
      imapPort: input.imapPort,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
    })

    this.db
      .prepare(
        `INSERT INTO accounts (
          id,
          provider_id,
          external_account_id,
          label,
          email_address,
          display_name,
          is_enabled,
          setup_status,
          settings_json,
          position
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .run(
        id,
        input.providerId,
        externalAccountId,
        input.label,
        input.emailAddress,
        input.displayName,
        setupStatus,
        settings,
        this.nextPosition(),
      )

    return {
      id,
      providerId: input.providerId,
      label: input.label,
      externalAccountId,
      emailAddress: input.emailAddress,
      displayName: input.displayName,
      isEnabled: true,
      setupStatus,
    }
  }

  upsertConnected(input: UpsertConnectedAccountInput): AccountRecord {
    const existing = this.db
      .prepare(
        `SELECT
          id,
          provider_id,
          label,
          external_account_id,
          email_address,
          display_name,
          is_enabled,
          setup_status,
          settings_json,
          last_sync_at
         FROM accounts
         WHERE provider_id = ? AND external_account_id = ?`,
      )
      .get(input.providerId, input.profile.externalAccountId) as AccountRow | undefined

    const settingsJson = JSON.stringify(input.profile.settings ?? {})

    if (existing) {
      this.db
        .prepare(
          `UPDATE accounts
           SET label = ?,
               email_address = ?,
               display_name = ?,
               is_enabled = 1,
               setup_status = 'connected',
               settings_json = ?,
               updated_at = datetime('now')
           WHERE id = ?`,
        )
        .run(
          input.profile.label,
          input.profile.emailAddress,
          input.profile.displayName,
          settingsJson,
          existing.id,
        )

      return {
        ...mapRow(existing),
        label: input.profile.label,
        emailAddress: input.profile.emailAddress,
        displayName: input.profile.displayName,
        isEnabled: true,
        setupStatus: 'connected',
        settings: input.profile.settings ?? {},
      }
    }

    const id = randomUUID()

    this.db
      .prepare(
        `INSERT INTO accounts (
          id,
          provider_id,
          external_account_id,
          label,
          email_address,
          display_name,
          is_enabled,
          setup_status,
          settings_json,
          position
        ) VALUES (?, ?, ?, ?, ?, ?, 1, 'connected', ?, ?)`,
      )
      .run(
        id,
        input.providerId,
        input.profile.externalAccountId,
        input.profile.label,
        input.profile.emailAddress,
        input.profile.displayName,
        settingsJson,
        this.nextPosition(),
      )

    return {
      id,
      providerId: input.providerId,
      externalAccountId: input.profile.externalAccountId,
      label: input.profile.label,
      emailAddress: input.profile.emailAddress,
      displayName: input.profile.displayName,
      isEnabled: true,
      setupStatus: 'connected',
      settings: input.profile.settings ?? {},
    }
  }

  updateSettings(accountId: UUID, settings: Record<string, unknown>): void {
    this.db
      .prepare(
        `UPDATE accounts
         SET settings_json = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(JSON.stringify(settings), accountId)
  }

  markSyncComplete(accountId: UUID): void {
    this.db
      .prepare(
        `UPDATE accounts
         SET setup_status = 'connected',
             last_sync_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(accountId)
  }

  markSetupStatusError(accountId: UUID): void {
    this.db
      .prepare(
        `UPDATE accounts
         SET setup_status = 'error',
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(accountId)
  }

  count(): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS count FROM accounts`).get() as { count: number }
    return row.count
  }

  reorder(ids: UUID[]): AccountSummary[] {
    const update = this.db.prepare(
      `UPDATE accounts SET position = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    const txn = this.db.transaction((orderedIds: UUID[]) => {
      orderedIds.forEach((id, index) => update.run(index, id))
    })
    txn(ids)
    return this.list()
  }

  delete(accountId: UUID): void {
    this.db.prepare(`DELETE FROM accounts WHERE id = ?`).run(accountId)
  }
}

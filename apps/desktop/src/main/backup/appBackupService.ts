import type BetterSqlite3 from 'better-sqlite3'
import { Buffer } from 'node:buffer'
import { AppError } from '@shared/errors'
import { SCHEMA_VERSION } from '@main/database/schema'
import {
  decryptField,
  deriveVaultKey,
  encryptField,
  generateSalt,
  getDefaultKdfParams,
  type KdfParams,
} from '@main/security/passVaultCrypto'

// libsql expose l'API synchrone de better-sqlite3 (cf. database/client.ts) : on type la
// connexion avec ces declarations partagees.
type DatabaseConnection = BetterSqlite3.Database

// AAD propre a la sauvegarde COMPLETE de l'app, distinct de l'export omniPass
// ('omnipass:export:v1') : un blob chiffre pour un domaine ne peut pas etre rejoue dans
// l'autre (l'authentification GCM echouerait).
const BACKUP_AAD = Buffer.from('omnidesk:backup:v1', 'utf8')

// Tables pilotees par le moteur (recreees/maintenues au demarrage par schema.ts) : on ne les
// sauvegarde ni ne les restaure -- la base cible garde son propre etat de migration.
const EXCLUDED_TABLES = new Set(['schema_migrations', 'sqlite_sequence'])

// Enveloppe autonome et versionnee. Le contenu (toutes les tables) est chiffre dans `blob` ;
// l'entete (kdf, salt) permet de re-deriver la cle a l'import. Aucun secret en clair.
interface BackupEnvelope {
  app: 'omnidesk'
  kind: 'full-backup'
  v: 1
  schemaVersion: number
  createdAt: string
  kdf: KdfParams
  salt: string
  blob: string
}

type TableRows = Record<string, Record<string, unknown>[]>

interface BackupPayload {
  tables: TableRows
}

export interface DecodedBackup {
  schemaVersion: number
  tables: TableRows
}

// Sauvegarde / restauration de l'integralite de la base. Les colonnes chiffrees (*_enc, *_b64)
// sont copiees telles quelles : le coffre omniPass (zero-knowledge) reste illisible sans son
// mot de passe maitre ; les secrets enrobes par safeStorage (jetons IMAP, identifiants du
// navigateur) ne se redechiffrent que sur la machine d'origine et seront a re-saisir ailleurs.
export class AppBackupService {
  constructor(private readonly db: DatabaseConnection) {}

  private listTables(): string[] {
    const rows = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
    // Les noms proviennent du schema (jamais d'une saisie utilisateur) ; on filtre malgre tout
    // sur un motif strict avant toute interpolation SQL, par defense en profondeur.
    return rows
      .map((row) => row.name)
      .filter((name) => !EXCLUDED_TABLES.has(name) && /^[A-Za-z0-9_]+$/.test(name))
  }

  private columnsOf(table: string): string[] {
    const rows = this.db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]
    return rows.map((row) => row.name)
  }

  // Exporte toute la base dans une enveloppe chiffree par le mot de passe choisi (scrypt + AES-256-GCM).
  async buildBackup(exportPassword: string): Promise<string> {
    const tables: TableRows = {}
    for (const table of this.listTables()) {
      tables[table] = this.db.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[]
    }

    const salt = generateSalt()
    const params = getDefaultKdfParams()
    const key = await deriveVaultKey(exportPassword, salt, params)
    try {
      const envelope: BackupEnvelope = {
        app: 'omnidesk',
        kind: 'full-backup',
        v: 1,
        schemaVersion: SCHEMA_VERSION,
        createdAt: new Date().toISOString(),
        kdf: params,
        salt: salt.toString('base64'),
        blob: encryptField(key, JSON.stringify({ tables } satisfies BackupPayload), BACKUP_AAD),
      }
      return JSON.stringify(envelope)
    } finally {
      key.fill(0)
    }
  }

  // Dechiffre et valide une sauvegarde SANS toucher a la base : un mot de passe errone ou un
  // fichier etranger echoue ici, avant le moindre effet de bord.
  async decode(fileContent: string, exportPassword: string): Promise<DecodedBackup> {
    let envelope: BackupEnvelope
    try {
      envelope = JSON.parse(fileContent) as BackupEnvelope
    } catch {
      throw new AppError('VALIDATION_FAILED', 'Fichier de sauvegarde illisible.')
    }
    if (envelope.app !== 'omnidesk' || envelope.kind !== 'full-backup' || envelope.v !== 1) {
      throw new AppError('VALIDATION_FAILED', "Ce fichier n'est pas une sauvegarde Omnidesk.")
    }
    if (!envelope.kdf || !envelope.salt || !envelope.blob) {
      throw new AppError('VALIDATION_FAILED', 'Fichier de sauvegarde incomplet.')
    }

    const key = await deriveVaultKey(exportPassword, Buffer.from(envelope.salt, 'base64'), envelope.kdf)
    let json: string
    try {
      json = decryptField(key, envelope.blob, BACKUP_AAD)
    } catch {
      throw new AppError('VALIDATION_FAILED', 'Mot de passe incorrect ou sauvegarde corrompue.')
    } finally {
      key.fill(0)
    }

    let payload: BackupPayload
    try {
      payload = JSON.parse(json) as BackupPayload
    } catch {
      throw new AppError('VALIDATION_FAILED', 'Contenu de la sauvegarde invalide.')
    }
    if (!payload.tables || typeof payload.tables !== 'object') {
      throw new AppError('VALIDATION_FAILED', 'Contenu de la sauvegarde invalide.')
    }
    return { schemaVersion: envelope.schemaVersion, tables: payload.tables }
  }

  // Remplace integralement le contenu de la base par celui de la sauvegarde. Les contraintes de
  // cle etrangere sont desactivees le temps de l'operation (l'ordre des tables n'importe alors
  // plus), puis reactivees. La reecriture est atomique : la moindre erreur annule TOUT (rollback),
  // la base reste donc intacte en cas d'echec.
  apply(decoded: DecodedBackup): { tables: number; rows: number } {
    const targetTables = new Set(this.listTables())
    let tableCount = 0
    let rowCount = 0

    this.db.pragma('foreign_keys = OFF')
    try {
      this.db.transaction(() => {
        // On vide d'abord toutes les tables cibles : une entree retiree dans la sauvegarde
        // disparait bien de la base restauree (restauration = remplacement, pas fusion).
        for (const table of targetTables) {
          this.db.prepare(`DELETE FROM "${table}"`).run()
        }
        for (const [table, rows] of Object.entries(decoded.tables)) {
          if (!targetTables.has(table) || !Array.isArray(rows) || rows.length === 0) {
            continue
          }
          // Intersection sauvegarde ∩ schema actuel : tolere une sauvegarde issue d'une version
          // voisine (colonne ajoutee/retiree) sans planter la restauration.
          const schemaCols = new Set(this.columnsOf(table))
          const first = rows[0] as Record<string, unknown>
          const cols = Object.keys(first).filter((col) => schemaCols.has(col))
          if (cols.length === 0) {
            continue
          }
          const quotedCols = cols.map((col) => `"${col}"`).join(', ')
          const placeholders = cols.map(() => '?').join(', ')
          const stmt = this.db.prepare(`INSERT INTO "${table}" (${quotedCols}) VALUES (${placeholders})`)
          for (const row of rows) {
            const record = row as Record<string, unknown>
            const values: unknown[] = cols.map((col) => (record[col] === undefined ? null : record[col]))
            stmt.run(...values)
            rowCount += 1
          }
          tableCount += 1
        }
      })()
    } finally {
      this.db.pragma('foreign_keys = ON')
    }

    return { tables: tableCount, rows: rowCount }
  }
}

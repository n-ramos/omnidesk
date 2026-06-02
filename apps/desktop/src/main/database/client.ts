import { app } from 'electron'
import LibsqlDatabase from 'libsql'
import type BetterSqlite3 from 'better-sqlite3'
import { join } from 'node:path'
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { AppError } from '@shared/errors'
import { logger } from '@main/logger'
import { getDatabaseKey } from '@main/security/databaseKey'
import { migrationSql, schemaSql } from './schema'

// libsql expose une API synchrone compatible better-sqlite3 (prepare/run/get/all/exec/
// pragma/transaction). On conserve donc les types @types/better-sqlite3 cote repositories
// (ils n'utilisent que ce sous-ensemble commun). Avantages vs better-sqlite3 : module N-API
// (ABI-stable -> aucun rebuild par version d'Electron) + chiffrement au repos natif.
type DatabaseConnection = BetterSqlite3.Database

export class DatabaseClient {
  private db?: DatabaseConnection
  private dbPath?: string

  open(): DatabaseConnection {
    if (this.db) {
      return this.db
    }

    const dataDirectory = join(app.getPath('userData'), 'data')
    mkdirSync(dataDirectory, { recursive: true })

    const dbPath = join(dataDirectory, 'omnidesk.sqlite')
    const db = this.openEncrypted(dbPath, getDatabaseKey())
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.exec(schemaSql)
    this.applyIdempotentMigrations(db)

    this.db = db
    this.dbPath = dbPath
    logger.info('Encrypted SQLite database opened', { dbPath })

    return db
  }

  // libsql accepte encryptionKey au runtime (chiffrement au repos) mais ne le declare pas
  // encore dans ses types Options : on cast ici, en un seul endroit.
  private connect(dbPath: string, key: string): DatabaseConnection {
    const options = { encryptionKey: key } as unknown as ConstructorParameters<typeof LibsqlDatabase>[1]
    return new LibsqlDatabase(dbPath, options) as unknown as DatabaseConnection
  }

  // Ouvre la base chiffree. Si une base existante ne peut pas etre lue avec la cle
  // (heritage non chiffre d'avant le chiffrement, ou cle absente), on la sauvegarde et on
  // en recree une chiffree -- jamais de perte silencieuse, jamais d'ecrasement aveugle.
  private openEncrypted(dbPath: string, key: string): DatabaseConnection {
    try {
      const db = this.connect(dbPath, key)
      db.prepare('SELECT count(*) FROM sqlite_master').get()
      return db
    } catch (error) {
      if (!existsSync(dbPath)) {
        throw new AppError('DATABASE_ERROR', "Impossible d'ouvrir la base de donnees.", {
          cause: error instanceof Error ? error.message : String(error),
        })
      }

      const backup = `${dbPath}.pre-encryption-${Date.now()}.bak`
      renameSync(dbPath, backup)
      for (const suffix of ['-wal', '-shm']) {
        if (existsSync(`${dbPath}${suffix}`)) {
          rmSync(`${dbPath}${suffix}`)
        }
      }
      logger.warn('Existing database could not be opened with the encryption key; backed up and recreated', {
        backup,
      })

      return this.connect(dbPath, key)
    }
  }

  private applyIdempotentMigrations(db: DatabaseConnection): void {
    for (const statement of migrationSql.split(';')) {
      const trimmedStatement = statement.trim()
      if (!trimmedStatement) {
        continue
      }

      try {
        db.exec(`${trimmedStatement};`)
      } catch (error) {
        if (error instanceof Error && error.message.includes('duplicate column')) {
          continue
        }

        throw error
      }
    }
  }

  close(): void {
    this.db?.close()
    this.db = undefined
  }

  getPath(): string {
    if (this.dbPath) {
      return this.dbPath
    }

    return join(app.getPath('userData'), 'data', 'omnidesk.sqlite')
  }
}

export const databaseClient = new DatabaseClient()

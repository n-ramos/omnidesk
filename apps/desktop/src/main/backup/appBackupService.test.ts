import Database from 'libsql'
import type BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { schemaSql } from '../database/schema'
import { AppBackupService } from './appBackupService'

// Meme approche que les tests de repositories : base :memory: + schema complet, cast vers le
// sous-ensemble d'API commun a libsql et better-sqlite3.
const makeDb = (): BetterSqlite3.Database => {
  const db = new Database(':memory:')
  db.exec(schemaSql)
  return db as unknown as BetterSqlite3.Database
}

const PASSWORD = 'correct-horse-battery-staple'

const seed = (db: BetterSqlite3.Database): void => {
  db.prepare('INSERT INTO providers (id, display_name, kind, capabilities) VALUES (?, ?, ?, ?)').run(
    'imap',
    'IMAP',
    'imap',
    '[]',
  )
  db.prepare(
    'INSERT INTO accounts (id, provider_id, external_account_id, label) VALUES (?, ?, ?, ?)',
  ).run('acc-1', 'imap', 'ext-1', 'Pro')
  db.prepare('INSERT INTO app_settings (key, value_json) VALUES (?, ?)').run('accentColor', '"#8ee6bf"')
  db.prepare('INSERT INTO omnichat_contacts (user_id, pseudo) VALUES (?, ?)').run('uid-1', 'Alice')
}

describe('AppBackupService', () => {
  it('round-trip : exporte puis restaure a l identique sur une autre base', async () => {
    const source = makeDb()
    seed(source)
    const backup = await new AppBackupService(source).buildBackup(PASSWORD)

    const target = makeDb()
    // Donnee preexistante qui DOIT disparaitre : la restauration remplace, ne fusionne pas.
    target.prepare('INSERT INTO app_settings (key, value_json) VALUES (?, ?)').run('accentColor', '"#000000"')

    const service = new AppBackupService(target)
    const result = service.apply(await service.decode(backup, PASSWORD))

    expect(result.rows).toBeGreaterThan(0)
    expect(target.prepare("SELECT label FROM accounts WHERE id = 'acc-1'").get()).toMatchObject({
      label: 'Pro',
    })
    expect(target.prepare("SELECT value_json AS v FROM app_settings WHERE key = 'accentColor'").get()).toMatchObject({
      v: '"#8ee6bf"',
    })
    expect(target.prepare("SELECT pseudo FROM omnichat_contacts WHERE user_id = 'uid-1'").get()).toMatchObject({
      pseudo: 'Alice',
    })
    // La base cible ne contient plus que les donnees de la sauvegarde (l accent noir a saute).
    expect(target.prepare('SELECT count(*) AS n FROM app_settings').get()).toMatchObject({ n: 1 })
  })

  it('rejette un mot de passe incorrect sans modifier la base', async () => {
    const source = makeDb()
    seed(source)
    const backup = await new AppBackupService(source).buildBackup(PASSWORD)

    const service = new AppBackupService(makeDb())
    await expect(service.decode(backup, 'mauvais-mot-de-passe')).rejects.toThrow()
  })

  it('rejette un fichier qui n est pas une sauvegarde Omnidesk', async () => {
    const service = new AppBackupService(makeDb())
    await expect(service.decode('{"app":"autre","kind":"full-backup","v":1}', PASSWORD)).rejects.toThrow()
    await expect(service.decode('ceci n est pas du json', PASSWORD)).rejects.toThrow()
  })
})

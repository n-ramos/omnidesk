import { app, safeStorage } from 'electron'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AppError } from '@shared/errors'

const KEY_FILE = 'omnidesk.dbkey'

// Cle de chiffrement de la base (libsql) : 32 octets aleatoires generes une seule fois,
// puis stockes chiffres par safeStorage -- dont la cle maitre est protegee par le trousseau
// de l'OS. Sans acces au trousseau de la session, le fichier de cle (et donc toute la base)
// est illisible. A appeler apres app.ready (safeStorage l'exige).
export const getDatabaseKey = (): string => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new AppError(
      'DATABASE_ERROR',
      "Le chiffrement securise du systeme n'est pas disponible : impossible d'ouvrir la base.",
    )
  }

  const dataDirectory = join(app.getPath('userData'), 'data')
  mkdirSync(dataDirectory, { recursive: true })
  const keyPath = join(dataDirectory, KEY_FILE)

  if (existsSync(keyPath)) {
    return safeStorage.decryptString(readFileSync(keyPath))
  }

  const key = randomBytes(32).toString('hex')
  writeFileSync(keyPath, safeStorage.encryptString(key))
  return key
}

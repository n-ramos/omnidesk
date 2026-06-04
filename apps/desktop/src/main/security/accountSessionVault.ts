import { Buffer } from 'node:buffer'
import { safeStorage } from 'electron'
import { AppError, errorMessage } from '@shared/errors'
import { logger } from '@main/logger'
import { databaseClient } from '@main/database/client'
import { AppSettingsRepository } from '@main/database/repositories/appSettingsRepository'

// Session du compte OmniProxy (mode accounts) : jetons d'acces/refresh + identite.
// Secret mono-occurrence (pas lie a un compte local) : meme principe qu'aiSecretVault
// -- safeStorage chiffre le blob (cle maitre dans le trousseau de l'OS), stocke en
// base64 dans app_settings. La base est elle-meme chiffree au repos : double protection.
// Les jetons ne quittent jamais le process main.
const SESSION_KEY = 'account.sessionB64'

export interface StoredSession {
  accessToken: string
  // Opaque, ~30 jours, ROTATIF : remplace a chaque /auth/refresh.
  refreshToken: string
  email: string
  displayName: string
  userId: string
  emailVerified: boolean
}

const settings = (): AppSettingsRepository => new AppSettingsRepository(databaseClient.open())

const ensureEncryptionAvailable = (): void => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new AppError(
      'TOKEN_STORAGE_FAILED',
      "Le chiffrement securise du systeme n'est pas disponible.",
    )
  }
}

export const accountSessionVault = {
  read(): StoredSession | null {
    const secretB64 = settings().get<string>(SESSION_KEY)
    if (!secretB64) {
      return null
    }
    try {
      ensureEncryptionAvailable()
      const json = safeStorage.decryptString(Buffer.from(secretB64, 'base64'))
      const parsed = JSON.parse(json) as Partial<StoredSession>
      if (!parsed.refreshToken || !parsed.email) {
        throw new Error('blob de session incomplet')
      }
      return parsed as StoredSession
    } catch (error) {
      // Blob illisible (changement d'identite de l'app, trousseau indisponible, format
      // obsolete...) : on purge et on repli proprement plutot que de bloquer -- l'utilisateur
      // se reconnectera. Cf. memoire safeStorage & identite de l'app.
      try {
        settings().delete(SESSION_KEY)
      } catch (purgeError) {
        logger.error('echec de la purge de la session illisible', purgeError)
      }
      logger.warn('session de compte illisible, reinitialisee', {
        error: errorMessage(error, 'safeStorage.decryptString a echoue'),
      })
      return null
    }
  },

  write(session: StoredSession): void {
    try {
      ensureEncryptionAvailable()
      const secretB64 = safeStorage.encryptString(JSON.stringify(session)).toString('base64')
      settings().set<string>(SESSION_KEY, secretB64)
    } catch (error) {
      logger.error('Failed to store account session', error)
      throw new AppError('TOKEN_STORAGE_FAILED', 'Impossible de proteger la session du compte.')
    }
  },

  clear(): void {
    settings().delete(SESSION_KEY)
  },

  has(): boolean {
    return settings().get<string>(SESSION_KEY) != null
  },
}

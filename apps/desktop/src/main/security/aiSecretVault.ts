import { Buffer } from 'node:buffer'
import { safeStorage } from 'electron'
import { AppError, errorMessage } from '@shared/errors'
import { logger } from '@main/logger'
import { databaseClient } from '@main/database/client'
import { AppSettingsRepository } from '@main/database/repositories/appSettingsRepository'

// Le token du fournisseur IA est un secret mono-occurrence (pas lie a un compte) : on ne
// reutilise donc pas tokenVault (keye par compte/provider) mais le MEME principe -- safeStorage
// chiffre la valeur (cle maitre dans le trousseau de l'OS), stockee en base64 dans app_settings.
// La base est elle-meme chiffree au repos : double protection. Le token ne quitte jamais le main.
const TOKEN_KEY = 'ai.openai.tokenB64'

const settings = (): AppSettingsRepository => new AppSettingsRepository(databaseClient.open())

const ensureEncryptionAvailable = (): void => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new AppError(
      'TOKEN_STORAGE_FAILED',
      "Le chiffrement securise du systeme n'est pas disponible.",
    )
  }
}

export const aiSecretVault = {
  setToken(token: string): void {
    try {
      ensureEncryptionAvailable()
      const secretB64 = safeStorage.encryptString(token).toString('base64')
      settings().set<string>(TOKEN_KEY, secretB64)
    } catch (error) {
      logger.error('Failed to store AI token', error)
      throw new AppError('TOKEN_STORAGE_FAILED', 'Impossible de proteger la cle.')
    }
  },

  getToken(): string | null {
    const secretB64 = settings().get<string>(TOKEN_KEY)
    if (!secretB64) {
      return null
    }
    try {
      ensureEncryptionAvailable()
      return safeStorage.decryptString(Buffer.from(secretB64, 'base64'))
    } catch (error) {
      // Blob illisible (changement d'identite de l'app, trousseau indisponible...) : on purge
      // et on repli proprement plutot que de bloquer. L'utilisateur ressaisira sa cle.
      try {
        settings().delete(TOKEN_KEY)
      } catch (purgeError) {
        logger.error('echec de la purge de la cle IA illisible', purgeError)
      }
      logger.warn('cle IA illisible, reinitialisee', {
        error: errorMessage(error, 'safeStorage.decryptString a echoue'),
      })
      return null
    }
  },

  hasToken(): boolean {
    return settings().get<string>(TOKEN_KEY) != null
  },

  clearToken(): void {
    settings().delete(TOKEN_KEY)
  },
}

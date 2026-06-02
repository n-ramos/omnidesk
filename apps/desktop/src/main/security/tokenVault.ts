import { safeStorage } from 'electron'
import { AppError } from '@shared/errors'
import type { ProviderKind, UUID } from '@shared/models'
import { logger } from '@main/logger'
import { databaseClient } from '@main/database/client'

export type TokenKind = 'access' | 'refresh' | 'password'

// Les secrets (jetons OAuth, mots de passe IMAP) sont chiffres via safeStorage -- dont la
// cle maitre est protegee par le trousseau de l'OS (Keychain sur macOS) -- puis stockes en
// base. La base est elle-meme chiffree au repos par SQLCipher : double protection. Remplace
// keytar (module natif, non maintenu depuis 2022) sans aucune dependance native.
const ensureEncryptionAvailable = (): void => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new AppError(
      'TOKEN_STORAGE_FAILED',
      "Le chiffrement securise du systeme n'est pas disponible.",
    )
  }
}

export const tokenVault = {
  async setToken(
    providerId: ProviderKind,
    accountId: UUID,
    tokenKind: TokenKind,
    token: string,
  ): Promise<void> {
    try {
      ensureEncryptionAvailable()
      const secretB64 = safeStorage.encryptString(token).toString('base64')
      databaseClient
        .open()
        .prepare(
          `INSERT INTO account_secrets (account_id, provider_id, token_kind, secret_b64, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'))
           ON CONFLICT(account_id, provider_id, token_kind)
           DO UPDATE SET secret_b64 = excluded.secret_b64, updated_at = excluded.updated_at`,
        )
        .run(accountId, providerId, tokenKind, secretB64)
    } catch (error) {
      logger.error('Failed to store secret', error)
      throw new AppError('TOKEN_STORAGE_FAILED', 'Impossible de proteger ces informations.')
    }
  },

  async getToken(
    providerId: ProviderKind,
    accountId: UUID,
    tokenKind: TokenKind,
  ): Promise<string | null> {
    try {
      const row = databaseClient
        .open()
        .prepare(
          `SELECT secret_b64 FROM account_secrets
           WHERE account_id = ? AND provider_id = ? AND token_kind = ?`,
        )
        .get(accountId, providerId, tokenKind) as { secret_b64: string } | undefined

      if (!row) {
        return null
      }

      ensureEncryptionAvailable()
      return safeStorage.decryptString(Buffer.from(row.secret_b64, 'base64'))
    } catch (error) {
      logger.error('Failed to read secret', error)
      throw new AppError('TOKEN_STORAGE_FAILED', 'Impossible de lire ces informations protegees.')
    }
  },

  async deleteTokens(providerId: ProviderKind, accountId: UUID): Promise<void> {
    try {
      databaseClient
        .open()
        .prepare(`DELETE FROM account_secrets WHERE account_id = ? AND provider_id = ?`)
        .run(accountId, providerId)
    } catch (error) {
      logger.error('Failed to delete secrets', error)
      throw new AppError(
        'TOKEN_STORAGE_FAILED',
        'Impossible de supprimer ces informations protegees.',
      )
    }
  },
}

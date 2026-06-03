import type { Database } from 'better-sqlite3'

interface VaultRow {
  kdf_salt: string
  kdf_params: string
  verifier_b64: string
}

// Meta du coffre stockee telle quelle (valeurs deja serialisees) : le repository reste agnostique
// de la crypto. Le service convertit sel (base64) et parametres (JSON) au moment voulu.
export interface StoredVaultMeta {
  saltB64: string
  paramsJson: string
  verifierB64: string
}

// Persiste l'unique ligne (id = 1) decrivant la racine de confiance du coffre : sel KDF,
// parametres KDF et verificateur. Ne contient NI mot de passe maitre NI cle derivee.
export class PassVaultRepository {
  constructor(private readonly db: Database) {}

  exists(): boolean {
    return this.db.prepare('SELECT 1 FROM pass_vault WHERE id = 1').get() !== undefined
  }

  getMeta(): StoredVaultMeta | undefined {
    const row = this.db
      .prepare('SELECT kdf_salt, kdf_params, verifier_b64 FROM pass_vault WHERE id = 1')
      .get() as VaultRow | undefined
    if (!row) {
      return undefined
    }
    return { saltB64: row.kdf_salt, paramsJson: row.kdf_params, verifierB64: row.verifier_b64 }
  }

  initialize(input: StoredVaultMeta): void {
    this.db
      .prepare('INSERT INTO pass_vault (id, kdf_salt, kdf_params, verifier_b64) VALUES (1, ?, ?, ?)')
      .run(input.saltB64, input.paramsJson, input.verifierB64)
  }

  // Rotation lors d'un futur changement de mot de passe maitre (M2) : nouveau sel + verificateur.
  updateMeta(input: StoredVaultMeta): void {
    this.db
      .prepare(
        `UPDATE pass_vault
         SET kdf_salt = ?, kdf_params = ?, verifier_b64 = ?, updated_at = datetime('now')
         WHERE id = 1`,
      )
      .run(input.saltB64, input.paramsJson, input.verifierB64)
  }

  // --- Touch ID (M3) : cle du coffre enveloppee par safeStorage (null = desactive). ---
  getBiometricWrapped(): string | null {
    const row = this.db
      .prepare('SELECT biometric_wrapped_b64 FROM pass_vault WHERE id = 1')
      .get() as { biometric_wrapped_b64: string | null } | undefined
    return row?.biometric_wrapped_b64 ?? null
  }

  setBiometricWrapped(wrappedB64: string | null): void {
    // libsql route un argument UNIQUE vers le binding par parametres nommes des que typeof === 'object' ;
    // or `typeof null === 'object'`, donc `.run(null)` jette "failed to downcast any to object". On efface
    // donc via un NULL litteral (sans parametre) ; la branche valeur conserve le bind positionnel normal.
    if (wrappedB64 === null) {
      this.db
        .prepare("UPDATE pass_vault SET biometric_wrapped_b64 = NULL, updated_at = datetime('now') WHERE id = 1")
        .run()
      return
    }
    this.db
      .prepare(
        "UPDATE pass_vault SET biometric_wrapped_b64 = ?, updated_at = datetime('now') WHERE id = 1",
      )
      .run(wrappedB64)
  }

  // --- Code de recuperation (M3) : cle du coffre chiffree par une cle derivee du code. ---
  getRecovery(): { saltB64: string; paramsJson: string; wrappedB64: string } | null {
    const row = this.db
      .prepare('SELECT recovery_salt, recovery_params, recovery_wrapped_b64 FROM pass_vault WHERE id = 1')
      .get() as
      | { recovery_salt: string | null; recovery_params: string | null; recovery_wrapped_b64: string | null }
      | undefined
    if (!row || !row.recovery_salt || !row.recovery_params || !row.recovery_wrapped_b64) {
      return null
    }
    return {
      saltB64: row.recovery_salt,
      paramsJson: row.recovery_params,
      wrappedB64: row.recovery_wrapped_b64,
    }
  }

  setRecovery(input: { saltB64: string; paramsJson: string; wrappedB64: string } | null): void {
    this.db
      .prepare(
        `UPDATE pass_vault
         SET recovery_salt = ?, recovery_params = ?, recovery_wrapped_b64 = ?, updated_at = datetime('now')
         WHERE id = 1`,
      )
      .run(input?.saltB64 ?? null, input?.paramsJson ?? null, input?.wrappedB64 ?? null)
  }
}

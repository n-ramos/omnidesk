export type AppErrorCode =
  | 'UNKNOWN'
  | 'VALIDATION_FAILED'
  | 'DATABASE_ERROR'
  | 'PROVIDER_UNAVAILABLE'
  | 'AUTH_REQUIRED'
  | 'OAUTH_FAILED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_STORAGE_FAILED'
  | 'VAULT_NOT_INITIALIZED'
  | 'VAULT_ALREADY_INITIALIZED'
  | 'VAULT_LOCKED'
  | 'INVALID_MASTER_PASSWORD'
  | 'AI_NOT_CONFIGURED'
  | 'AI_AUTH_FAILED'
  | 'AI_RATE_LIMITED'
  | 'AI_NETWORK'
  | 'AI_TOOL_UNKNOWN'
  | 'AI_TOOL_INVALID_ARGS'
  | 'AI_PROVIDER_ERROR'
  // Authentification par compte aupres d'OmniProxy (mode accounts).
  | 'ACCOUNT_NOT_AUTHENTICATED'
  | 'ACCOUNT_AUTH_FAILED'
  | 'ACCOUNT_EMAIL_TAKEN'
  | 'ACCOUNT_DISABLED'
  // Email non verifie (compte cree mais messagerie/appels bloques tant que non verifie).
  | 'ACCOUNT_EMAIL_NOT_VERIFIED'
  // Code de verification invalide / expire / aucune verification en attente.
  | 'ACCOUNT_VERIFICATION_FAILED'
  // Reinitialisation de mot de passe : code/email invalide ou expire (message generique).
  | 'ACCOUNT_RESET_INVALID'
  // Trop de tentatives (429) sur la verification.
  | 'ACCOUNT_RATE_LIMITED'
  // --- Provider GitHub (lien OAuth via OmniProxy) ---
  // Aucun compte GitHub lie a ce compte OmniProxy -> proposer "Connecter GitHub".
  | 'GITHUB_NOT_LINKED'
  // Token GitHub revoque/expire cote proxy -> proposer de reconnecter GitHub.
  | 'GITHUB_AUTH_FAILED'
  // Scope GitHub insuffisant pour l'action demandee.
  | 'GITHUB_FORBIDDEN'
  // Quota GitHub atteint (details.resetAt eventuel).
  | 'GITHUB_RATE_LIMITED'

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

// Message lisible d'une erreur inconnue, avec repli si ce n'est pas une Error.
export const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback

export const toSafeError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error
  }

  if (error instanceof Error) {
    return new AppError('UNKNOWN', error.message)
  }

  return new AppError('UNKNOWN', 'An unexpected error occurred.')
}

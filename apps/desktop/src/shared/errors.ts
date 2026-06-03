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

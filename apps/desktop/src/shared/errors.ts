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

export const toSafeError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error
  }

  if (error instanceof Error) {
    return new AppError('UNKNOWN', error.message)
  }

  return new AppError('UNKNOWN', 'An unexpected error occurred.')
}

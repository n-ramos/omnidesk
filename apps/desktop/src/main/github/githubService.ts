import { shell } from 'electron'
import { AppError, type AppErrorCode, toSafeError } from '@shared/errors'
import { omniProxyClient } from '@main/proxy/omniProxyClient'
import type { GithubStatus, GithubSummary } from '@shared/github'

// Service du provider GitHub (cote main). Tout passe par OmniProxy, qui detient le
// client_secret de l'OAuth App et le token GitHub de l'utilisateur (jamais expose a l'app).
// L'authentification au proxy reutilise le JWT du compte via omniProxyClient.authed*.
// Cf. docs/github-provider-contract.md.
class GithubService {
  isConfigured(): boolean {
    return omniProxyClient.isConfigured()
  }

  getStatus(): Promise<GithubStatus> {
    return this.run(() => omniProxyClient.authedGet<GithubStatus>('/github/status'))
  }

  // Demarre le flux OAuth : recupere l'URL d'autorisation aupres du proxy et l'ouvre dans
  // le navigateur SYSTEME (jamais une BrowserWindow embarquee). Le retour arrive via le deep
  // link omnidesk://github/connected (cf. main/index.ts) ; aucun secret ne transite par l'app.
  async connect(): Promise<{ ok: true }> {
    const { authorizeUrl } = await this.run(() =>
      omniProxyClient.authedPost<{ authorizeUrl: string }>('/github/oauth/start', {}),
    )
    await shell.openExternal(authorizeUrl)
    return { ok: true }
  }

  async disconnect(): Promise<{ ok: true }> {
    await this.run(() => omniProxyClient.authedPost<{ ok: true }>('/github/disconnect', {}))
    return { ok: true }
  }

  getSummary(limit?: number): Promise<GithubSummary> {
    const query = limit ? `?limit=${encodeURIComponent(String(limit))}` : ''
    return this.run(() => omniProxyClient.authedGet<GithubSummary>(`/github/summary${query}`))
  }

  private async run<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call()
    } catch (error) {
      throw this.mapError(error)
    }
  }

  // Traduit les erreurs du proxy (portees par AppError.details.proxyError / status, poses par
  // omniProxyClient.toError) vers les codes specifiques du provider. Les erreurs de compte
  // (ACCOUNT_*) et reseau (PROVIDER_UNAVAILABLE) remontent telles quelles.
  private mapError(error: unknown): AppError {
    if (!(error instanceof AppError)) {
      return toSafeError(error)
    }
    const details: Record<string, unknown> = error.details ?? {}
    const proxyError = typeof details.proxyError === 'string' ? details.proxyError : undefined
    const status = typeof details.status === 'number' ? details.status : undefined
    const remap = (code: AppErrorCode, message: string): AppError =>
      new AppError(code, message, error.details)

    if (proxyError === 'GITHUB_NOT_LINKED' || status === 409) {
      return remap('GITHUB_NOT_LINKED', 'Compte GitHub non connecte.')
    }
    if (proxyError === 'GITHUB_TOKEN_INVALID') {
      return remap('GITHUB_AUTH_FAILED', 'Connexion GitHub expiree. Reconnecte ton compte GitHub.')
    }
    if (proxyError === 'GITHUB_INSUFFICIENT_SCOPE') {
      return remap('GITHUB_FORBIDDEN', 'Autorisations GitHub insuffisantes pour cette action.')
    }
    if (proxyError === 'GITHUB_RATE_LIMITED' || status === 429) {
      return remap('GITHUB_RATE_LIMITED', 'Quota GitHub atteint. Reessaie dans un moment.')
    }
    return error
  }
}

export const githubService = new GithubService()

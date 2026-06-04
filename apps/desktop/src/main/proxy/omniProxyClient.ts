import { appConfig } from '@main/config/env'
import { AppError, type AppErrorCode } from '@shared/errors'
import { accountAuthService } from '@main/account/accountAuthService'
import { postJson, type JsonError, type JsonResult } from '@main/proxy/httpJson'

export interface CallTokenInput {
  callId: string
  room: string
  identity: string
  name?: string
}

export interface LivekitTokenResult {
  url: string
  token: string
  room: string
  identity: string
}

// Client du backend OmniProxy (LiveKit). C'est le SEUL composant main qui parle aux
// routes LiveKit ; le renderer ne le voit jamais (il passe par IPC). Le proxy detient
// les cles LiveKit. En mode comptes, le jeton d'ACCES (JWT court) voyage dans le CORPS
// (champ `auth`) et `identity` DOIT etre l'email du compte (cf. accountAuthService).
class OmniProxyClient {
  isConfigured(): boolean {
    return Boolean(appConfig.OMNIDESK_PROXY_URL)
  }

  private baseUrl(): string {
    const url = appConfig.OMNIDESK_PROXY_URL
    if (!url) {
      throw new AppError('PROVIDER_UNAVAILABLE', "OmniProxy n'est pas configure (OMNIDESK_PROXY_URL).")
    }
    return url.replace(/\/+$/, '')
  }

  // Routes LiveKit protegees : refresh PROACTIF du jeton avant l'appel, puis rejeu UNE
  // fois sur 401/403 (jeton refuse/expire) apres un /auth/refresh. Un refresh 401 purge
  // la session (-> retour au gate de connexion via l'evenement account:session).
  private async postLivekit<T>(
    path: string,
    body: Record<string, unknown>,
    errorCode: AppErrorCode = 'PROVIDER_UNAVAILABLE',
  ): Promise<T> {
    const token = await accountAuthService.ensureFreshAccessToken()
    if (!token) {
      throw new AppError('ACCOUNT_NOT_AUTHENTICATED', 'Connectez-vous pour utiliser les appels.')
    }
    const url = `${this.baseUrl()}${path}`
    let result = await postJson<T>(url, { ...body, auth: token })
    // Email non verifie : rejouer n'aiderait pas. On resynchronise l'etat (passera en
    // 'unverified' -> ecran de verification) et on remonte une erreur explicite.
    if (!result.ok && result.status === 403 && result.error?.error === 'EMAIL_NOT_VERIFIED') {
      void accountAuthService.refreshUser()
      throw new AppError('ACCOUNT_EMAIL_NOT_VERIFIED', 'Verifie ton adresse email pour utiliser les appels.')
    }
    if (!result.ok && (result.status === 401 || result.status === 403)) {
      const fresh = await accountAuthService.refreshNow()
      result = await postJson<T>(url, { ...body, auth: fresh })
    }
    if (!result.ok || result.data === undefined) {
      throw this.toError(result, errorCode)
    }
    return result.data
  }

  private toError(result: JsonResult<unknown>, errorCode: AppErrorCode): AppError {
    const error = (result.error ?? {}) as JsonError
    return new AppError(errorCode, error.message ?? `OmniProxy a renvoye HTTP ${result.status}.`, {
      proxyError: error.error,
      status: result.status,
    })
  }

  // --- LiveKit (appels ad-hoc) ---
  // Jeton d'appel : le proxy (autorite) ne mint que pour l'hote/les invites de CET
  // appel ; `identity` (= email du compte) est prouvee par le JWT du champ `auth`.
  callToken(input: CallTokenInput): Promise<LivekitTokenResult> {
    return this.postLivekit<LivekitTokenResult>('/livekit/call-token', { ...input })
  }

  startRecording(callId: string, room: string, identity?: string): Promise<{ egressId: string }> {
    return this.postLivekit<{ egressId: string }>('/livekit/recordings/start', {
      callId,
      room,
      ...(identity ? { identity } : {}),
    })
  }

  stopRecording(egressId: string, identity?: string): Promise<{ ok: true }> {
    return this.postLivekit<{ ok: true }>('/livekit/recordings/stop', {
      egressId,
      ...(identity ? { identity } : {}),
    })
  }
}

export const omniProxyClient = new OmniProxyClient()

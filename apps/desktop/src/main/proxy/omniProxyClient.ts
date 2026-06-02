import { appConfig } from '@main/config/env'
import { AppError, type AppErrorCode } from '@shared/errors'
import { logger } from '@main/logger'

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

interface ProxyErrorBody {
  error?: string
  message?: string
}

// Client du backend OmniProxy (omnichat / LiveKit). C'est le SEUL composant qui
// parle au proxy ; le renderer ne le voit jamais (il passe par IPC). Le proxy
// detient les cles LiveKit ; ici on ne transporte que la cle d'API partagee.
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

  private async post<T>(
    path: string,
    body: unknown,
    errorCode: AppErrorCode = 'PROVIDER_UNAVAILABLE',
  ): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (appConfig.OMNIDESK_PROXY_API_KEY) {
      headers.Authorization = `Bearer ${appConfig.OMNIDESK_PROXY_API_KEY}`
    }

    let response: Response
    try {
      response = await fetch(`${this.baseUrl()}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body ?? {}),
      })
    } catch (cause) {
      logger.error('OmniProxy injoignable', { path, cause: String(cause) })
      throw new AppError(
        errorCode,
        "OmniProxy est injoignable. Verifiez qu'il est demarre et que OMNIDESK_PROXY_URL est correct.",
      )
    }

    const text = await response.text()
    let payload: unknown
    try {
      payload = text ? JSON.parse(text) : undefined
    } catch {
      throw new AppError(errorCode, `Reponse OmniProxy illisible (HTTP ${response.status}).`)
    }

    if (!response.ok) {
      const errorBody = (payload ?? {}) as ProxyErrorBody
      throw new AppError(errorCode, errorBody.message ?? `OmniProxy a renvoye HTTP ${response.status}.`, {
        proxyError: errorBody.error,
        status: response.status,
      })
    }

    return payload as T
  }

  // --- LiveKit (appels ad-hoc) ---
  // Jeton d'appel : le proxy (autorite) ne mint que pour l'hote/les invites de CET
  // appel. Preuve d'identite HMAC ajoutee si la signature est active (anti-usurpation).
  callToken(input: CallTokenInput): Promise<LivekitTokenResult> {
    const auth = appConfig.OMNIDESK_OMNICHAT_TOKEN
    return this.post<LivekitTokenResult>('/livekit/call-token', auth ? { ...input, auth } : input)
  }

  startRecording(callId: string, room: string, identity?: string): Promise<{ egressId: string }> {
    const auth = appConfig.OMNIDESK_OMNICHAT_TOKEN
    return this.post<{ egressId: string }>('/livekit/recordings/start', {
      callId,
      room,
      ...(identity ? { identity } : {}),
      ...(auth ? { auth } : {}),
    })
  }

  stopRecording(egressId: string, identity?: string): Promise<{ ok: true }> {
    const auth = appConfig.OMNIDESK_OMNICHAT_TOKEN
    return this.post<{ ok: true }>('/livekit/recordings/stop', {
      egressId,
      ...(identity ? { identity } : {}),
      ...(auth ? { auth } : {}),
    })
  }
}

export const omniProxyClient = new OmniProxyClient()

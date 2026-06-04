import { AppError } from '@shared/errors'

// Helper HTTP/JSON PUR (aucune logique d'auth, n'importe ni le client proxy ni le
// service de session). Partage par accountAuthService (routes PUBLIQUES /auth/*) et
// omniProxyClient (routes protegees) : comme aucun des deux n'importe l'autre, on
// evite tout cycle d'import.
//
// Distinction volontaire entre une erreur RESEAU (hote injoignable -> rejette une
// AppError 'PROVIDER_UNAVAILABLE') et une reponse HTTP d'ERREUR (renvoyee telquelle
// dans { ok:false, status }, a mapper par l'appelant qui seul connait sa semantique).

export interface JsonError {
  error?: string
  message?: string
  // Details optionnels (ex. RESEND_TOO_SOON -> { retryAfterMs }).
  details?: Record<string, unknown>
}

export interface JsonResult<T> {
  ok: boolean
  status: number
  data?: T
  error?: JsonError
}

const UNREACHABLE =
  'OmniProxy est injoignable. Verifiez votre connexion et que OMNIDESK_PROXY_URL est correct.'

const parseResponse = async <T>(response: Response): Promise<JsonResult<T>> => {
  const text = await response.text()
  let payload: unknown
  try {
    payload = text ? JSON.parse(text) : undefined
  } catch {
    throw new AppError('PROVIDER_UNAVAILABLE', `Reponse OmniProxy illisible (HTTP ${response.status}).`)
  }
  if (response.ok) {
    return { ok: true, status: response.status, data: payload as T }
  }
  return { ok: false, status: response.status, error: (payload ?? {}) as JsonError }
}

export const postJson = async <T>(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<JsonResult<T>> => {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body ?? {}),
    })
  } catch {
    throw new AppError('PROVIDER_UNAVAILABLE', UNREACHABLE)
  }
  return parseResponse<T>(response)
}

export const getJson = async <T>(
  url: string,
  headers: Record<string, string> = {},
): Promise<JsonResult<T>> => {
  let response: Response
  try {
    response = await fetch(url, { method: 'GET', headers })
  } catch {
    throw new AppError('PROVIDER_UNAVAILABLE', UNREACHABLE)
  }
  return parseResponse<T>(response)
}

export const patchJson = async <T>(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<JsonResult<T>> => {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body ?? {}),
    })
  } catch {
    throw new AppError('PROVIDER_UNAVAILABLE', UNREACHABLE)
  }
  return parseResponse<T>(response)
}

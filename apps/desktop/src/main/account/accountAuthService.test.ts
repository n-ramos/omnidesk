import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@shared/errors'
// Import de TYPE uniquement (erase au runtime) : l'instance est importee dynamiquement
// dans beforeEach apres vi.resetModules() pour repartir d'un singleton vierge.
import type { accountAuthService as AuthServiceInstance } from '@main/account/accountAuthService'

// Mocks partages (hoisted pour pouvoir etre references dans les factories vi.mock).
const { postJson, getJson, patchJson, store } = vi.hoisted(() => ({
  postJson: vi.fn(),
  getJson: vi.fn(),
  patchJson: vi.fn(),
  store: { current: null as unknown },
}))

vi.mock('@main/config/env', () => ({ appConfig: { OMNIDESK_PROXY_URL: 'http://proxy.test' } }))
vi.mock('@main/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@main/proxy/httpJson', () => ({ postJson, getJson, patchJson }))
vi.mock('@main/security/accountSessionVault', () => ({
  accountSessionVault: {
    read: vi.fn(() => store.current),
    write: vi.fn((session: unknown) => {
      store.current = session
    }),
    clear: vi.fn(() => {
      store.current = null
    }),
    has: vi.fn(() => store.current != null),
  },
}))

// JWT factice : seul le champ `exp` du payload est lu (aucune verification de signature).
const makeJwt = (expInSeconds: number): string => {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expInSeconds }),
  ).toString('base64url')
  return `header.${payload}.sig`
}

const authResponse = (over: Record<string, unknown> = {}) => ({
  ok: true as const,
  status: 200,
  data: {
    accessToken: makeJwt(3600),
    refreshToken: 'r1',
    user: { id: 'u1', email: 'alice@example.com', displayName: 'Alice', emailVerified: true },
    ...over,
  },
})

let service: typeof AuthServiceInstance

beforeEach(async () => {
  vi.resetModules()
  postJson.mockReset()
  getJson.mockReset()
  patchJson.mockReset()
  store.current = null
  ;({ accountAuthService: service } = await import('@main/account/accountAuthService'))
})

afterEach(() => {
  // Stoppe le minuteur de refresh (sinon timer ouvert entre les tests).
  service.stop()
})

describe('accountAuthService', () => {
  it('login : etablit la session, la persiste et expose l email en minuscules', async () => {
    postJson.mockResolvedValueOnce(authResponse())

    const status = await service.login({ email: 'Alice@Example.com', password: 'secretpw' })

    expect(status.state).toBe('authenticated')
    expect(status.user?.displayName).toBe('Alice')
    expect(store.current).toMatchObject({ refreshToken: 'r1', email: 'alice@example.com' })
    // L'identite OmniChat = email normalise en minuscules.
    expect(service.currentEmail()).toBe('alice@example.com')
    expect(postJson).toHaveBeenCalledWith('http://proxy.test/auth/login', {
      email: 'Alice@Example.com',
      password: 'secretpw',
    })
  })

  it('refreshNow : envoie le refresh stocke et le REMPLACE par le nouveau (rotation)', async () => {
    postJson.mockResolvedValueOnce(authResponse())
    await service.login({ email: 'a@b.co', password: 'x' })

    postJson.mockResolvedValueOnce(authResponse({ refreshToken: 'r2' }))
    await service.refreshNow()

    const refreshCall = postJson.mock.calls.find(([url]) => String(url).endsWith('/auth/refresh'))
    expect(refreshCall?.[1]).toEqual({ refreshToken: 'r1' })
    expect(store.current).toMatchObject({ refreshToken: 'r2' })
  })

  it('refreshNow : un 401 purge la session et propage ACCOUNT_AUTH_FAILED', async () => {
    postJson.mockResolvedValueOnce(authResponse())
    await service.login({ email: 'a@b.co', password: 'x' })

    postJson.mockResolvedValueOnce({ ok: false, status: 401, error: { error: 'INVALID_REFRESH' } })

    await expect(service.refreshNow()).rejects.toMatchObject({ code: 'ACCOUNT_AUTH_FAILED' })
    expect(service.status().state).toBe('unauthenticated')
    expect(store.current).toBeNull()
  })

  it('restoreSession : une erreur reseau CONSERVE la session (pas de purge)', async () => {
    store.current = {
      accessToken: makeJwt(3600),
      refreshToken: 'r1',
      email: 'a@b.co',
      displayName: 'A',
      userId: 'u1',
      emailVerified: true,
    }
    postJson.mockRejectedValueOnce(new AppError('PROVIDER_UNAVAILABLE', 'injoignable'))

    await service.restoreSession()

    expect(service.status().state).toBe('authenticated')
    expect(store.current).not.toBeNull()
  })

  it('ensureFreshAccessToken : ne rafraichit pas un jeton encore valide', async () => {
    postJson.mockResolvedValueOnce(authResponse())
    await service.login({ email: 'a@b.co', password: 'x' })

    postJson.mockClear()
    const token = await service.ensureFreshAccessToken()

    expect(token).toBeTruthy()
    // exp lointain -> aucun appel /auth/refresh.
    expect(postJson).not.toHaveBeenCalled()
  })

  it('register : EMAIL_TAKEN (409) -> AppError ACCOUNT_EMAIL_TAKEN, pas de session', async () => {
    postJson.mockResolvedValueOnce({ ok: false, status: 409, error: { error: 'EMAIL_TAKEN' } })

    await expect(
      service.register({ email: 'taken@example.com', password: 'longenough', displayName: 'X' }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_EMAIL_TAKEN' })
    expect(service.status().state).toBe('unauthenticated')
  })

  it('email non verifie -> etat "unverified" et isVerified=false', async () => {
    postJson.mockResolvedValueOnce(
      authResponse({
        user: { id: 'u1', email: 'a@b.co', displayName: 'A', emailVerified: false },
      }),
    )

    const status = await service.login({ email: 'a@b.co', password: 'x' })

    expect(status.state).toBe('unverified')
    expect(service.isVerified()).toBe(false)
  })

  it('verifyEmail : passe a "authenticated" et REMPLACE l access (refresh conserve)', async () => {
    postJson.mockResolvedValueOnce(
      authResponse({
        refreshToken: 'r1',
        user: { id: 'u1', email: 'a@b.co', displayName: 'A', emailVerified: false },
      }),
    )
    await service.login({ email: 'a@b.co', password: 'x' })

    const newAccess = makeJwt(3600)
    postJson.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        accessToken: newAccess,
        user: { id: 'u1', email: 'a@b.co', displayName: 'A', emailVerified: true },
      },
    })

    const status = await service.verifyEmail('123456')

    expect(status.state).toBe('authenticated')
    expect(service.isVerified()).toBe(true)
    expect(store.current).toMatchObject({ accessToken: newAccess, refreshToken: 'r1' })
  })

  it('resendVerification : 429 RESEND_TOO_SOON -> { ok:false, retryAfterMs } (pas une erreur)', async () => {
    postJson.mockResolvedValueOnce(
      authResponse({
        user: { id: 'u1', email: 'a@b.co', displayName: 'A', emailVerified: false },
      }),
    )
    await service.login({ email: 'a@b.co', password: 'x' })

    postJson.mockResolvedValueOnce({
      ok: false,
      status: 429,
      error: { error: 'RESEND_TOO_SOON', details: { retryAfterMs: 45000 } },
    })

    await expect(service.resendVerification()).resolves.toEqual({ ok: false, retryAfterMs: 45000 })
  })

  it('resetPassword : succes -> purge la session locale (toutes revoquees)', async () => {
    postJson.mockResolvedValueOnce(authResponse())
    await service.login({ email: 'a@b.co', password: 'x' })

    postJson.mockResolvedValueOnce({ ok: true, status: 200, data: { ok: true } })

    await expect(
      service.resetPassword({ email: 'a@b.co', code: '123456', newPassword: 'longenough' }),
    ).resolves.toEqual({ ok: true })
    expect(service.status().state).toBe('unauthenticated')
    expect(store.current).toBeNull()
  })

  it('updateDisplayName : PATCH /auth/me met a jour le pseudo + remplace l access', async () => {
    postJson.mockResolvedValueOnce(authResponse({ refreshToken: 'r1' }))
    await service.login({ email: 'a@b.co', password: 'x' })

    const newAccess = makeJwt(3600)
    patchJson.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        accessToken: newAccess,
        user: { id: 'u1', email: 'a@b.co', displayName: 'Bob', emailVerified: true },
      },
    })

    const status = await service.updateDisplayName('Bob')

    expect(status.user?.displayName).toBe('Bob')
    expect(store.current).toMatchObject({ displayName: 'Bob', accessToken: newAccess, refreshToken: 'r1' })
  })
})

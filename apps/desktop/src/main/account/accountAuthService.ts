import { Buffer } from 'node:buffer'
import { appConfig } from '@main/config/env'
import { eventBus } from '@main/events/eventBus'
import { logger } from '@main/logger'
import { AppError, errorMessage } from '@shared/errors'
import type {
  AuthLoginInput,
  AuthRegisterInput,
  AuthResetPasswordInput,
  AuthStatus,
  AuthUser,
  ResendVerificationResult,
} from '@shared/auth'
import { getJson, patchJson, postJson, type JsonError, type JsonResult } from '@main/proxy/httpJson'
import { accountSessionVault, type StoredSession } from '@main/security/accountSessionVault'

// Reponse d'authentification d'OmniProxy (register / login / refresh).
interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    email: string
    displayName: string
    emailVerified: boolean
    status?: string
    createdAt?: string
  }
}

// Reponse de verify-email / PATCH me : nouvel access (refresh inchange) + user a jour.
interface TokenUserResponse {
  accessToken: string
  user: AuthResponse['user']
}

// Marge avant l'expiration de l'access (JWT ~60 min) pour un refresh PROACTIF : le
// jeton transporte (corps LiveKit, hello WS, en-tete /auth/me) est ainsi quasi toujours
// frais, ce qui evite la plupart des rejeux sur 401.
const REFRESH_SKEW_MS = 5 * 60 * 1000
// Repli si l'`exp` du JWT est illisible : on reprogramme un refresh ~55 min apres reception.
const FALLBACK_REFRESH_MS = 55 * 60 * 1000
// Plancher : ne jamais (re)programmer un refresh quasi immediat (anti-boucle).
const MIN_REFRESH_DELAY_MS = 10 * 1000
// Node borne les timers a un entier signe 32 bits. Au-dela, il force le delai a 1 ms
// et peut provoquer une boucle de refresh agressive.
const MAX_REFRESH_DELAY_MS = 2_147_483_647
const RATE_LIMIT_RETRY_FALLBACK_MS = 60 * 1000

// Service d'authentification par COMPTE (mode accounts d'OmniProxy). Detient la session
// en memoire (jeton d'acces courant) et la persiste chiffree (accountSessionVault).
// SOURCE UNIQUE du jeton transporte aux 3 canaux (REST LiveKit, hello WS, /auth/me).
// Les routes /auth/* sont publiques : on les appelle via httpJson (sans bearer), donc
// ce service ne depend PAS d'omniProxyClient -> pas de cycle.
class AccountAuthService {
  private session: StoredSession | null = null
  private refreshTimer?: ReturnType<typeof setTimeout>
  // Deduplique les refresh concurrents (ex. plusieurs 401 en parallele + le minuteur).
  private refreshInFlight?: Promise<string>

  private isConfigured(): boolean {
    return Boolean(appConfig.OMNIDESK_PROXY_URL)
  }

  private baseUrl(): string {
    const url = appConfig.OMNIDESK_PROXY_URL
    if (!url) {
      throw new AppError('PROVIDER_UNAVAILABLE', "OmniProxy n'est pas configure (OMNIDESK_PROXY_URL).")
    }
    return url.replace(/\/+$/, '')
  }

  // --- Etat expose au renderer -------------------------------------------
  status(): AuthStatus {
    if (!this.isConfigured()) {
      return { state: 'unconfigured', user: null }
    }
    if (!this.session) {
      return { state: 'unauthenticated', user: null }
    }
    // Compte cree mais email non verifie : etat distinct -> ecran de saisie du code.
    if (!this.session.emailVerified) {
      return { state: 'unverified', user: this.toUser(this.session) }
    }
    return { state: 'authenticated', user: this.toUser(this.session) }
  }

  hasSession(): boolean {
    return this.session != null
  }

  // Session UTILISABLE (omnichat / appels) : presente ET email verifie. C'est ce que la
  // signalisation WS exige (le serveur refuse un hello non verifie : EMAIL_NOT_VERIFIED).
  isVerified(): boolean {
    return this.session != null && this.session.emailVerified
  }

  getAccessToken(): string | null {
    return this.session?.accessToken ?? null
  }

  // Identite OmniChat = email du compte, normalise en minuscules (comme le serveur).
  currentEmail(): string | null {
    return this.session ? this.session.email.trim().toLowerCase() : null
  }

  currentDisplayName(): string | null {
    return this.session?.displayName ?? null
  }

  private toUser(session: StoredSession): AuthUser {
    return {
      id: session.userId,
      email: session.email,
      displayName: session.displayName,
      emailVerified: session.emailVerified,
    }
  }

  // --- Cycle de vie -------------------------------------------------------
  // Au demarrage : restaure une session stockee puis tente un refresh. Un refresh 401
  // (invalide/expire/deja tourne) -> purge + retour login. Une erreur RESEAU -> on
  // CONSERVE la session (l'omnichat restera simplement hors-ligne jusqu'au retour reseau).
  async restoreSession(): Promise<void> {
    if (!this.isConfigured()) {
      return
    }
    const stored = accountSessionVault.read()
    if (!stored) {
      return
    }
    this.session = stored
    this.emit()
    try {
      await this.refreshNow()
    } catch (error) {
      if (error instanceof AppError && error.code === 'ACCOUNT_AUTH_FAILED') {
        // refreshNow a deja purge la session et emis l'etat 'unauthenticated'.
        return
      }
      // Reseau : on garde la session et on reprogramme un refresh proactif.
      logger.info('account: refresh au demarrage impossible (hors-ligne ?), session conservee', {
        error: errorMessage(error, 'refresh echoue'),
      })
      this.scheduleRefresh(stored.accessToken)
    }
  }

  async register(input: AuthRegisterInput): Promise<AuthStatus> {
    const result = await postJson<AuthResponse>(`${this.baseUrl()}/auth/register`, {
      email: input.email,
      password: input.password,
      displayName: input.displayName,
    })
    if (!result.ok || !result.data) {
      throw this.mapAuthError(result.status, result.error)
    }
    this.applySession(result.data)
    return this.status()
  }

  async login(input: AuthLoginInput): Promise<AuthStatus> {
    const result = await postJson<AuthResponse>(`${this.baseUrl()}/auth/login`, {
      email: input.email,
      password: input.password,
    })
    if (!result.ok || !result.data) {
      throw this.mapAuthError(result.status, result.error)
    }
    this.applySession(result.data)
    return this.status()
  }

  async logout(): Promise<AuthStatus> {
    const session = this.session
    if (session) {
      // Revocation serveur du refresh (best-effort : on purge en local quoi qu'il arrive).
      try {
        await postJson(
          `${this.baseUrl()}/auth/logout`,
          { refreshToken: session.refreshToken },
          { Authorization: `Bearer ${session.accessToken}` },
        )
      } catch (error) {
        logger.info('account: /auth/logout a echoue (purge locale conservee)', {
          error: errorMessage(error, 'logout echoue'),
        })
      }
    }
    this.clearSession()
    return this.status()
  }

  // GET /auth/me (rejoue une fois sur 401). Rafraichit le profil affiche / stocke.
  async me(): Promise<AuthUser | null> {
    if (!this.session) {
      return null
    }
    const token = await this.ensureFreshAccessToken()
    if (!token) {
      return null
    }
    const url = `${this.baseUrl()}/auth/me`
    let result = await getJson<{ user: AuthResponse['user'] }>(url, { Authorization: `Bearer ${token}` })
    if (result.status === 401) {
      const fresh = await this.refreshNow()
      result = await getJson<{ user: AuthResponse['user'] }>(url, { Authorization: `Bearer ${fresh}` })
    }
    if (!result.ok || !result.data || !this.session) {
      return null
    }
    this.session = {
      ...this.session,
      email: result.data.user.email,
      displayName: result.data.user.displayName,
      userId: result.data.user.id,
      emailVerified: result.data.user.emailVerified,
    }
    accountSessionVault.write(this.session)
    this.emit()
    return this.toUser(this.session)
  }

  // --- Verification d'email -----------------------------------------------
  // Saisie du code a 6 chiffres. Succes -> { user, accessToken } : on REMPLACE l'access
  // stocke (il porte emailVerified=true) en conservant le refresh. Rejoue 1x sur 401.
  async verifyEmail(code: string): Promise<AuthStatus> {
    const result = await this.authedRequest<TokenUserResponse>((token) =>
      postJson(`${this.baseUrl()}/auth/verify-email`, { code }, { Authorization: `Bearer ${token}` }),
    )
    if (!result.ok || !result.data) {
      throw this.mapVerifyError(result.status, result.error)
    }
    this.updateAccessAndUser(result.data.accessToken, result.data.user)
    return this.status()
  }

  // Renvoi du code. RESEND_TOO_SOON (429) n'est PAS une erreur fatale : on renvoie le
  // delai a respecter (retryAfterMs) pour le compte a rebours cote UI.
  async resendVerification(): Promise<ResendVerificationResult> {
    const result = await this.authedRequest<{ ok: true }>((token) =>
      postJson(`${this.baseUrl()}/auth/resend-verification`, {}, { Authorization: `Bearer ${token}` }),
    )
    if (result.ok) {
      return { ok: true }
    }
    if (result.status === 429) {
      const retryAfterMs = result.error?.details?.retryAfterMs
      return { ok: false, retryAfterMs: typeof retryAfterMs === 'number' ? retryAfterMs : undefined }
    }
    throw this.mapVerifyError(result.status, result.error)
  }

  // --- Mot de passe oublie (routes PUBLIQUES, sans jeton) -----------------
  // Le serveur repond TOUJOURS ok:true (anti-enumeration) ; on relaie tel quel.
  async forgotPassword(email: string): Promise<{ ok: true }> {
    await postJson(`${this.baseUrl()}/auth/forgot-password`, { email })
    return { ok: true }
  }

  // Reinitialisation : succes -> le serveur revoque TOUTES les sessions ; on purge la
  // session locale (retour login). INVALID_RESET -> message generique (anti-enumeration).
  async resetPassword(input: AuthResetPasswordInput): Promise<{ ok: true }> {
    const result = await postJson<{ ok: true }>(`${this.baseUrl()}/auth/reset-password`, {
      email: input.email,
      code: input.code,
      newPassword: input.newPassword,
    })
    if (!result.ok) {
      if (result.status === 400 && result.error?.error === 'VALIDATION_FAILED') {
        throw new AppError('VALIDATION_FAILED', 'Mot de passe trop court (8 caracteres minimum).')
      }
      throw new AppError('ACCOUNT_RESET_INVALID', 'Code invalide ou expire. Redemande un code.')
    }
    this.clearSession()
    return { ok: true }
  }

  // --- Profil -------------------------------------------------------------
  // Edition du pseudo (displayName). Succes -> { user, accessToken } : on remplace l'access
  // (claim `name` a jour) en conservant le refresh.
  async updateDisplayName(displayName: string): Promise<AuthStatus> {
    const result = await this.authedRequest<TokenUserResponse>((token) =>
      patchJson(`${this.baseUrl()}/auth/me`, { displayName }, { Authorization: `Bearer ${token}` }),
    )
    if (!result.ok || !result.data) {
      throw this.mapAuthError(result.status, result.error)
    }
    this.updateAccessAndUser(result.data.accessToken, result.data.user)
    return this.status()
  }

  // Resynchronise le profil (dont emailVerified) via /auth/me. Appele quand le serveur
  // signale EMAIL_NOT_VERIFIED (hello WS / 403 LiveKit) alors que l'etat local divergeait.
  async refreshUser(): Promise<void> {
    await this.me()
  }

  // --- Jeton d'acces ------------------------------------------------------
  // Renvoie un access frais : refresh proactif s'il expire bientot. Si le refresh
  // echoue pour cause RESEAU, renvoie le jeton courant (potentiellement expire) pour
  // laisser l'appel tenter sa chance -- un 401 declenchera alors le rejeu cote appelant.
  // Un refresh 401 (session morte) propage ACCOUNT_AUTH_FAILED.
  async ensureFreshAccessToken(): Promise<string | null> {
    if (!this.session) {
      return null
    }
    if (!this.isExpiringSoon(this.session.accessToken)) {
      return this.session.accessToken
    }
    try {
      return await this.refreshNow()
    } catch (error) {
      if (error instanceof AppError && error.code === 'ACCOUNT_AUTH_FAILED') {
        throw error
      }
      return this.session?.accessToken ?? null
    }
  }

  // Force un refresh (rotatif : remplace le refresh stocke). 401 -> purge + AppError
  // 'ACCOUNT_AUTH_FAILED'. Deduplique les appels concurrents via refreshInFlight.
  async refreshNow(): Promise<string> {
    if (this.refreshInFlight) {
      return this.refreshInFlight
    }
    const refreshToken = this.session?.refreshToken
    if (!refreshToken) {
      throw new AppError('ACCOUNT_NOT_AUTHENTICATED', 'Aucune session a rafraichir.')
    }
    const run = async (): Promise<string> => {
      const result = await postJson<AuthResponse>(`${this.baseUrl()}/auth/refresh`, { refreshToken })
      if (result.status === 401) {
        this.clearSession()
        throw new AppError('ACCOUNT_AUTH_FAILED', 'Session expiree, reconnexion necessaire.')
      }
      if (!result.ok || !result.data) {
        throw this.mapAuthError(result.status, result.error)
      }
      this.applySession(result.data)
      return result.data.accessToken
    }
    this.refreshInFlight = run()
    try {
      return await this.refreshInFlight
    } finally {
      this.refreshInFlight = undefined
    }
  }

  // Arret propre (avant fermeture de l'app) : stoppe le minuteur de refresh.
  stop(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = undefined
    }
  }

  // --- Interne ------------------------------------------------------------
  private applySession(data: AuthResponse): void {
    this.session = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      email: data.user.email,
      displayName: data.user.displayName,
      userId: data.user.id,
      emailVerified: data.user.emailVerified,
    }
    accountSessionVault.write(this.session)
    this.scheduleRefresh(data.accessToken)
    this.emit()
  }

  private clearSession(): void {
    this.session = null
    this.stop()
    accountSessionVault.clear()
    this.emit()
  }

  private emit(): void {
    eventBus.emit('account:session', this.status())
  }

  private scheduleRefresh(accessToken: string, retryAfterMs?: number): void {
    this.stop()
    const exp = this.jwtExpiryMs(accessToken)
    const delay = this.normalizeRefreshDelay(
      retryAfterMs ??
        (exp != null
          ? exp - Date.now() - REFRESH_SKEW_MS
          : FALLBACK_REFRESH_MS),
    )
    this.refreshTimer = setTimeout(() => {
      void this.refreshNow().catch((error) => {
        if (error instanceof AppError && error.code === 'ACCOUNT_AUTH_FAILED') {
          return
        }
        // Reseau : on retente plus tard tant que la session existe.
        logger.info('account: refresh proactif echoue, nouvelle tentative programmee', {
          error: errorMessage(error, 'refresh echoue'),
        })
        if (this.session) {
          this.scheduleRefresh(this.session.accessToken, this.retryDelayAfterFailure(error))
        }
      })
    }, delay)
  }

  private normalizeRefreshDelay(delayMs: number): number {
    if (!Number.isFinite(delayMs)) {
      return FALLBACK_REFRESH_MS
    }
    return Math.min(MAX_REFRESH_DELAY_MS, Math.max(MIN_REFRESH_DELAY_MS, Math.floor(delayMs)))
  }

  private retryDelayAfterFailure(error: unknown): number {
    if (error instanceof AppError && error.code === 'ACCOUNT_RATE_LIMITED') {
      const retryAfterMs = error.details?.retryAfterMs
      if (typeof retryAfterMs === 'number') {
        return this.normalizeRefreshDelay(retryAfterMs)
      }
      return RATE_LIMIT_RETRY_FALLBACK_MS
    }
    return RATE_LIMIT_RETRY_FALLBACK_MS
  }

  // exp (ms) du JWT, par simple LECTURE du payload (aucune verification de signature :
  // c'est le serveur qui fait foi ; on ne s'en sert que pour cadencer le refresh). null
  // si le jeton est illisible.
  private jwtExpiryMs(token: string): number | null {
    try {
      const payload = token.split('.')[1]
      if (!payload) {
        return null
      }
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        exp?: number
      }
      return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null
    } catch {
      return null
    }
  }

  private isExpiringSoon(token: string): boolean {
    const exp = this.jwtExpiryMs(token)
    if (exp == null) {
      // exp inconnu : on ne force pas de refresh (le rejeu sur 401 reste le filet).
      return false
    }
    return exp - Date.now() <= REFRESH_SKEW_MS
  }

  // Requete PROTEGEE (Bearer) avec refresh proactif + rejeu UNE fois sur 401. Renvoie le
  // JsonResult brut a l'appelant (qui mappe ses propres codes d'erreur).
  private async authedRequest<T>(
    send: (token: string) => Promise<JsonResult<T>>,
  ): Promise<JsonResult<T>> {
    const token = await this.ensureFreshAccessToken()
    if (!token) {
      throw new AppError('ACCOUNT_NOT_AUTHENTICATED', 'Connecte-toi pour effectuer cette action.')
    }
    let result = await send(token)
    if (result.status === 401) {
      const fresh = await this.refreshNow()
      result = await send(fresh)
    }
    return result
  }

  // Remplace l'access stocke (verify-email / PATCH me renvoient un nouvel access SANS
  // nouveau refresh) et resynchronise les champs user (emailVerified, displayName...).
  private updateAccessAndUser(accessToken: string, user: AuthResponse['user']): void {
    if (!this.session) {
      return
    }
    this.session = {
      ...this.session,
      accessToken,
      email: user.email,
      displayName: user.displayName,
      userId: user.id,
      emailVerified: user.emailVerified,
    }
    accountSessionVault.write(this.session)
    this.scheduleRefresh(accessToken)
    this.emit()
  }

  private mapVerifyError(status: number, error: JsonError | undefined): AppError {
    const code = error?.error
    if (status === 429 || code === 'TOO_MANY_ATTEMPTS') {
      return new AppError('ACCOUNT_RATE_LIMITED', 'Trop de tentatives. Reessaie dans quelques minutes.')
    }
    if (code === 'CODE_EXPIRED') {
      return new AppError('ACCOUNT_VERIFICATION_FAILED', 'Code expire. Demande un nouveau code.')
    }
    if (code === 'NO_VERIFICATION_PENDING') {
      return new AppError('ACCOUNT_VERIFICATION_FAILED', 'Aucune verification en attente.')
    }
    return new AppError('ACCOUNT_VERIFICATION_FAILED', 'Code invalide.')
  }

  // Mappe une reponse d'erreur d'OmniProxy vers un AppError (message generique pour
  // les identifiants, conformement au contrat : pas de fuite "email connu / mdp faux").
  private mapAuthError(status: number, error: JsonError | undefined): AppError {
    const code = error?.error
    if (status === 409 || code === 'EMAIL_TAKEN') {
      return new AppError('ACCOUNT_EMAIL_TAKEN', 'Cette adresse email est deja utilisee.')
    }
    if (status === 403 || code === 'ACCOUNT_DISABLED') {
      return new AppError('ACCOUNT_DISABLED', 'Ce compte est desactive.')
    }
    if (status === 401 || code === 'INVALID_CREDENTIALS' || code === 'INVALID_REFRESH') {
      return new AppError('ACCOUNT_AUTH_FAILED', 'Email ou mot de passe incorrect.')
    }
    if (status === 429 || code === 'TOO_MANY_ATTEMPTS' || code === 'RATE_LIMITED') {
      const retryAfterMs = error?.details?.retryAfterMs
      return new AppError(
        'ACCOUNT_RATE_LIMITED',
        error?.message ?? 'Trop de tentatives. Reessaie dans un moment.',
        typeof retryAfterMs === 'number' ? { retryAfterMs } : undefined,
      )
    }
    if (status === 400 || code === 'VALIDATION_FAILED') {
      return new AppError('VALIDATION_FAILED', 'Saisie invalide : verifiez l\'email et le mot de passe (8 caracteres minimum).')
    }
    return new AppError('PROVIDER_UNAVAILABLE', error?.message ?? `OmniProxy a renvoye HTTP ${status}.`)
  }
}

export const accountAuthService = new AccountAuthService()

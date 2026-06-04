import { defineStore } from 'pinia'
import { errorMessage } from '@shared/errors'
import type { AuthState, AuthStatus, AuthUser, ResendVerificationResult } from '@shared/auth'

// Disposer de l'abonnement push (module-level, comme les autres stores).
let stopAuthState: (() => void) | undefined

const api = () => window.omnidesk

interface SessionStoreState {
  // unconfigured : pas d'OmniProxy (messagerie/appels desactives, pas de login a afficher).
  // unauthenticated : proxy present, aucune session -> gate connexion/inscription.
  // authenticated : session active -> l'omnichat peut se connecter.
  state: AuthState
  user: AuthUser | null
  initialized: boolean
  working: boolean
  error?: string
}

// Session du COMPTE OmniProxy (mode comptes). Les jetons restent cote main : ce store ne
// detient que l'etat (AuthStatus) et pilote le gate de connexion. L'email du compte est
// l'identite OmniChat (DM, presence, appels).
export const useSessionStore = defineStore('session', {
  state: (): SessionStoreState => ({
    state: 'unconfigured',
    user: null,
    initialized: false,
    working: false,
  }),

  getters: {
    isAuthenticated: (state): boolean => state.state === 'authenticated',
    // Session ouverte mais email a verifier (compte cree, messagerie/appels bloques).
    isUnverified: (state): boolean => state.state === 'unverified',
    isConfigured: (state): boolean => state.state !== 'unconfigured',
    email: (state): string | null => state.user?.email ?? null,
    // Pseudo a afficher partout (jamais l'email). Repli sur l'email si absent.
    displayName: (state): string | null => state.user?.displayName ?? state.user?.email ?? null,
  },

  actions: {
    async init(): Promise<void> {
      if (this.initialized) {
        return
      }
      const a = api()
      if (!a?.auth?.getState) {
        return
      }
      this.initialized = true
      try {
        this.apply(await a.auth.getState())
      } catch {
        // Non critique : le gate affichera l'etat par defaut.
      }
      this.subscribe()
    },

    subscribe(): void {
      const a = api()
      if (!a?.events?.onAuthState) {
        return
      }
      stopAuthState?.()
      // Pousse depuis le main a chaque changement (login, logout, refresh, purge sur
      // refresh invalide) : tient le gate a jour sans polling.
      stopAuthState = a.events.onAuthState((status) => this.apply(status))
    },

    apply(status: AuthStatus): void {
      this.state = status.state
      this.user = status.user
    },

    async login(email: string, password: string): Promise<boolean> {
      const a = api()
      if (!a?.auth?.login) {
        return false
      }
      this.working = true
      this.error = undefined
      try {
        this.apply(await a.auth.login({ email: email.trim(), password }))
        return true
      } catch (error) {
        this.error = errorMessage(error, 'Connexion impossible.')
        return false
      } finally {
        this.working = false
      }
    },

    async register(email: string, password: string, displayName: string): Promise<boolean> {
      const a = api()
      if (!a?.auth?.register) {
        return false
      }
      this.working = true
      this.error = undefined
      try {
        this.apply(
          await a.auth.register({ email: email.trim(), password, displayName: displayName.trim() }),
        )
        return true
      } catch (error) {
        this.error = errorMessage(error, 'Inscription impossible.')
        return false
      } finally {
        this.working = false
      }
    },

    async logout(): Promise<void> {
      const a = api()
      if (!a?.auth?.logout) {
        return
      }
      this.working = true
      this.error = undefined
      try {
        this.apply(await a.auth.logout())
      } catch (error) {
        this.error = errorMessage(error, 'Deconnexion impossible.')
      } finally {
        this.working = false
      }
    },

    // --- Verification d'email ----------------------------------------------
    async verifyEmail(code: string): Promise<boolean> {
      const a = api()
      if (!a?.auth?.verifyEmail) {
        return false
      }
      this.working = true
      this.error = undefined
      try {
        this.apply(await a.auth.verifyEmail(code.trim()))
        return this.state === 'authenticated'
      } catch (error) {
        this.error = errorMessage(error, 'Code invalide.')
        return false
      } finally {
        this.working = false
      }
    },

    // Cooldown (retryAfterMs) renvoye en RESULTAT, pas en erreur -> l'UI affiche un compte a rebours.
    async resendVerification(): Promise<ResendVerificationResult> {
      const a = api()
      if (!a?.auth?.resendVerification) {
        return { ok: false }
      }
      this.error = undefined
      try {
        return await a.auth.resendVerification()
      } catch (error) {
        this.error = errorMessage(error, 'Impossible de renvoyer le code.')
        return { ok: false }
      }
    },

    // --- Mot de passe oublie -----------------------------------------------
    async forgotPassword(email: string): Promise<boolean> {
      const a = api()
      if (!a?.auth?.forgotPassword) {
        return false
      }
      this.working = true
      this.error = undefined
      try {
        await a.auth.forgotPassword(email.trim())
        return true
      } catch (error) {
        this.error = errorMessage(error, "Impossible d'envoyer le code.")
        return false
      } finally {
        this.working = false
      }
    },

    async resetPassword(email: string, code: string, newPassword: string): Promise<boolean> {
      const a = api()
      if (!a?.auth?.resetPassword) {
        return false
      }
      this.working = true
      this.error = undefined
      try {
        await a.auth.resetPassword({ email: email.trim(), code: code.trim(), newPassword })
        // Le serveur revoque toutes les sessions ; le main purge -> l'event AUTH_STATE
        // repasse le gate en 'unauthenticated'. L'utilisateur se reconnecte.
        return true
      } catch (error) {
        this.error = errorMessage(error, 'Reinitialisation impossible.')
        return false
      } finally {
        this.working = false
      }
    },

    // --- Profil (pseudo) ---------------------------------------------------
    async updateDisplayName(displayName: string): Promise<boolean> {
      const a = api()
      if (!a?.auth?.updateProfile) {
        return false
      }
      this.working = true
      this.error = undefined
      try {
        this.apply(await a.auth.updateProfile(displayName.trim()))
        return true
      } catch (error) {
        this.error = errorMessage(error, 'Impossible de mettre a jour le pseudo.')
        return false
      } finally {
        this.working = false
      }
    },
  },
})

// Types partages (main / preload / renderer) de l'authentification par COMPTE
// aupres d'OmniProxy (mode accounts). Les jetons ne quittent JAMAIS le process main :
// le renderer ne manipule que l'etat (AuthStatus) et les saisies (login/inscription).
//
// L'email du compte (normalise en minuscules cote serveur) est aussi l'identite
// OmniChat : adressage des DM, presence et identite des appels LiveKit.

export type AuthState =
  // OMNIDESK_PROXY_URL absent (build sans proxy) : ni messagerie ni appels, pas de login.
  | 'unconfigured'
  // Proxy configure mais aucune session : afficher le gate connexion/inscription.
  | 'unauthenticated'
  // Session ouverte mais email non verifie : compte cree, INUTILISABLE (messagerie/appels)
  // tant que le code a 6 chiffres n'est pas saisi -> afficher l'ecran de verification.
  | 'unverified'
  // Session active ET email verifie : l'omnichat peut se connecter, appels disponibles.
  | 'authenticated'

// Profil minimal expose au renderer (sous-ensemble du `user` renvoye par OmniProxy).
export interface AuthUser {
  id: string
  email: string
  displayName: string
  emailVerified: boolean
}

export interface AuthStatus {
  state: AuthState
  user: AuthUser | null
}

export interface AuthLoginInput {
  email: string
  password: string
}

export interface AuthRegisterInput {
  email: string
  password: string
  displayName: string
}

export interface AuthResetPasswordInput {
  email: string
  code: string
  newPassword: string
}

// Renvoi de code de verification : structure (PAS une erreur) car le cooldown
// RESEND_TOO_SOON porte un delai a respecter (retryAfterMs) que le renderer affiche.
export interface ResendVerificationResult {
  ok: boolean
  retryAfterMs?: number
}

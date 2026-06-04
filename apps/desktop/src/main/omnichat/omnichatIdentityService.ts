import type { Database } from 'better-sqlite3'
import type { UUID } from '@shared/models'
import { AccountRepository } from '@main/database/repositories/accountRepository'
import { accountAuthService } from '@main/account/accountAuthService'

// Identite OmniChat = compte OmniProxy connecte. Le serveur DERIVE l'identite (email +
// displayName) du JWT et IGNORE tout pseudo envoye par le client : l'email (en minuscules)
// est donc l'identifiant de transport (routage WS, cles de DM, membres de groupe, identite
// des appels) et le displayName l'affichage. Aucune identite n'existe hors connexion.
//
// Un unique compte local "self" (provider 'omnichat') ancre les conversations natives
// (contrainte de cle etrangere) ; son champ email stocke desormais l'email du compte.

const SELF_EXTERNAL_ACCOUNT_ID = 'omnichat:self'

export interface StoredOmnichatUser {
  id: string
  pseudo: string
}

export interface ResolvedOmnichatIdentity {
  id: string
  pseudo: string
  // Id du compte "self" (ancre FK) pour les conversations/messages natifs.
  accountId: UUID
}

export class OmnichatIdentityService {
  private readonly accounts: AccountRepository

  constructor(db: Database) {
    this.accounts = new AccountRepository(db)
  }

  // Identite courante derivee de la session, sans effet de bord. null si non connecte.
  peek(): StoredOmnichatUser | null {
    const email = accountAuthService.currentEmail()
    if (!email) {
      return null
    }
    return { id: email, pseudo: this.displayName(email) }
  }

  // Resout l'identite ET garantit le compte "self". null si non connecte.
  resolve(): ResolvedOmnichatIdentity | null {
    const user = this.peek()
    if (!user) {
      return null
    }
    return { ...user, accountId: this.ensureSelfAccount(user) }
  }

  private displayName(email: string): string {
    return accountAuthService.currentDisplayName()?.trim() || email
  }

  // Cree/met a jour l'unique compte local qui ancre les donnees natives. Idempotent :
  // keye sur (provider 'omnichat', external_account_id 'omnichat:self'). Son champ email
  // stocke l'email reel du compte (et non plus un UUID).
  private ensureSelfAccount(user: StoredOmnichatUser): UUID {
    const account = this.accounts.upsertConnected({
      providerId: 'omnichat',
      profile: {
        externalAccountId: SELF_EXTERNAL_ACCOUNT_ID,
        label: user.pseudo || 'Omnichat',
        emailAddress: user.id,
        displayName: user.pseudo,
      },
    })
    return account.id
  }
}

import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import type { UUID } from '@shared/models'
import { AccountRepository } from '@main/database/repositories/accountRepository'
import { AppSettingsRepository } from '@main/database/repositories/appSettingsRepository'

// Identite omnichat facon Discord : un PSEUDO choisi par l'utilisateur + un
// IDENTIFIANT unique et aleatoire (le "hash"), genere une fois et stable. Aucune
// dependance a un compte mail. L'identifiant sert de userId au transport (routage
// WS, cles de DM, membres de groupe) ; le pseudo n'est que l'affichage.
//
// Un unique compte local "self" (provider 'omnichat') ancre les conversations
// natives (contrainte de cle etrangere) ; son champ email stocke l'identifiant.

const IDENTITY_SETTING_KEY = 'omnichatUser'
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
  private readonly settings: AppSettingsRepository
  private readonly accounts: AccountRepository

  constructor(db: Database) {
    this.settings = new AppSettingsRepository(db)
    this.accounts = new AccountRepository(db)
  }

  // Identite courante sans effet de bord. null tant qu'aucun pseudo n'a ete choisi.
  peek(): StoredOmnichatUser | null {
    const stored = this.settings.get<StoredOmnichatUser>(IDENTITY_SETTING_KEY)
    if (
      stored
      && typeof stored.id === 'string'
      && stored.id.length > 0
      && typeof stored.pseudo === 'string'
      && stored.pseudo.length > 0
    ) {
      return { id: stored.id, pseudo: stored.pseudo }
    }
    return null
  }

  // Resout l'identite ET garantit le compte "self". null si pas encore configuree.
  resolve(): ResolvedOmnichatIdentity | null {
    const user = this.peek()
    if (!user) {
      return null
    }
    return { ...user, accountId: this.ensureSelfAccount(user) }
  }

  // Definit/met a jour le pseudo. Genere un identifiant unique au premier appel,
  // puis le conserve (changer de pseudo ne change pas l'identifiant).
  setIdentity(pseudo: string): ResolvedOmnichatIdentity {
    const trimmed = pseudo.trim()
    const existing = this.settings.get<StoredOmnichatUser>(IDENTITY_SETTING_KEY)
    const user: StoredOmnichatUser = {
      id: typeof existing?.id === 'string' && existing.id.length > 0 ? existing.id : randomUUID(),
      pseudo: trimmed,
    }
    this.settings.set<StoredOmnichatUser>(IDENTITY_SETTING_KEY, user)
    return { ...user, accountId: this.ensureSelfAccount(user) }
  }

  // Cree/met a jour l'unique compte local qui ancre les donnees natives.
  // Idempotent : keye sur (provider 'omnichat', external_account_id 'omnichat:self').
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

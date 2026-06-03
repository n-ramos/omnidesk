import { AppError } from '@shared/errors'
import type { AccountSummary } from '@shared/models'
import type { AccountRepository } from '@main/database/repositories/accountRepository'
import type { ConversationRepository } from '@main/database/repositories/conversationRepository'
import type { ProviderConnectionService } from '@main/providers/providerConnectionService'

// Dependances injectees aux actions mail (services/repos existants reutilises tels quels).
export interface MailActionDeps {
  accounts: AccountRepository
  conversations: ConversationRepository
  providerConnections: ProviderConnectionService
}

// Resout le compte IMAP connecte a utiliser. M2/M3 : on prend le premier (mono-compte).
// A defaut, on echoue clairement -> le modele le repercute a l'utilisateur.
export const requireImapAccount = (deps: MailActionDeps): AccountSummary => {
  const account = deps.accounts
    .list()
    .find((item) => item.providerId === 'imap' && item.setupStatus === 'connected')
  if (!account) {
    throw new AppError('PROVIDER_UNAVAILABLE', 'Aucun compte mail (IMAP) connecte.')
  }
  return account
}

// Coupe un texte trop long pour l'apercu de confirmation.
export const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}...` : text

// Sujet lisible d'un mail, en validant au passage son existence : si l'identifiant est
// invalide, l'action echoue proprement (sans afficher de confirmation pour un mail inexistant).
export const requireConversationSubject = (deps: MailActionDeps, conversationId: string): string => {
  const detail = deps.conversations.get(conversationId)
  if (!detail) {
    throw new AppError('VALIDATION_FAILED', 'Mail introuvable (identifiant invalide).')
  }
  return detail.subject ?? detail.title ?? '(mail)'
}

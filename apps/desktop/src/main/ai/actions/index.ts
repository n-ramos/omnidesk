import { aiActionRegistry } from '../aiActionRegistry'
import type { MailActionDeps } from './mailContext'
import { createMailComposeAction } from './mailComposeAction'
import { createMailListMessagesAction } from './mailListMessagesAction'
import { createMailListFoldersAction } from './mailListFoldersAction'
import { createMailMarkReadAction } from './mailMarkReadAction'
import { createMailMoveAction } from './mailMoveAction'
import { createMailDeleteAction } from './mailDeleteAction'

// Enregistre toutes les actions mail dans le registre. Appele une fois au demarrage, la ou
// les services existent (registerIpcHandlers). Ajouter une action = l'enregistrer ici.
export const registerMailActions = (deps: MailActionDeps): void => {
  aiActionRegistry.register(createMailListMessagesAction(deps))
  aiActionRegistry.register(createMailListFoldersAction(deps))
  aiActionRegistry.register(createMailComposeAction(deps))
  aiActionRegistry.register(createMailMarkReadAction(deps))
  aiActionRegistry.register(createMailMoveAction(deps))
  aiActionRegistry.register(createMailDeleteAction(deps))
}

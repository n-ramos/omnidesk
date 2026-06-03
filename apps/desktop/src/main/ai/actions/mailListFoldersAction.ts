import { z } from 'zod'
import type { AiToolDefinition } from '@shared/ai'
import { requireImapAccount, type MailActionDeps } from './mailContext'

const schema = z.object({})

type Args = z.infer<typeof schema>

// mail.list_folders : lecture seule. Donne au modele les chemins de dossiers (path) a passer
// a mail.move.
export const createMailListFoldersAction = (deps: MailActionDeps): AiToolDefinition<Args> => ({
  name: 'mail.list_folders',
  description:
    'Liste les dossiers de la boite mail (avec leur role : inbox, archive, trash...) et leur chemin (path), a utiliser pour deplacer un mail.',
  parameters: schema,
  mutating: false,
  category: 'mail',
  execute: async () => {
    const account = requireImapAccount(deps)
    const folders = await deps.providerConnections.listImapFolders(account.id)
    const items = folders.map((folder) => ({
      path: folder.path,
      name: folder.name,
      role: folder.role,
      unread: folder.unreadCount ?? 0,
    }))
    return {
      ok: true,
      summary: `${items.length} dossier(s).`,
      data: { folders: items },
    }
  },
})

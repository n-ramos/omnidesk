import { z } from 'zod'
import type { AiToolDefinition } from '@shared/ai'
import { requireConversationSubject, type MailActionDeps } from './mailContext'

const schema = z.object({
  conversationId: z.string().uuid().describe('Identifiant du mail (issu de mail.list_messages).'),
  folderPath: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .describe('Chemin du dossier de destination (issu de mail.list_folders).'),
})

type Args = z.infer<typeof schema>

// mail.move : mutante -> confirmation. Deplace un mail vers un dossier.
export const createMailMoveAction = (deps: MailActionDeps): AiToolDefinition<Args> => ({
  name: 'mail.move',
  description: 'Deplace un mail vers un autre dossier (ex: archive). Le dossier est designe par son path.',
  parameters: schema,
  mutating: true,
  category: 'mail',
  preview: async (args) => {
    const subject = requireConversationSubject(deps, args.conversationId)
    return {
      title: 'Deplacer le mail',
      summary: `Deplacer "${subject}" vers ${args.folderPath}`,
      effect: `Le mail sera deplace vers le dossier ${args.folderPath}.`,
    }
  },
  execute: async (args) => {
    await deps.providerConnections.moveImapConversation(args.conversationId, args.folderPath)
    return { ok: true, summary: `Mail deplace vers ${args.folderPath}.` }
  },
})

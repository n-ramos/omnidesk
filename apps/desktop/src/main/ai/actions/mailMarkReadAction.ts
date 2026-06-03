import { z } from 'zod'
import type { AiToolDefinition } from '@shared/ai'
import { requireConversationSubject, type MailActionDeps } from './mailContext'

const schema = z.object({
  conversationId: z.string().uuid().describe('Identifiant du mail (issu de mail.list_messages).'),
})

type Args = z.infer<typeof schema>

// mail.mark_read : mutante -> confirmation. Marque un mail comme lu (le marquage "non lu" cote
// serveur n'est pas encore supporte par la couche IMAP, on ne l'expose donc pas).
export const createMailMarkReadAction = (deps: MailActionDeps): AiToolDefinition<Args> => ({
  name: 'mail.mark_read',
  description: 'Marque un mail comme lu.',
  parameters: schema,
  mutating: true,
  category: 'mail',
  preview: async (args) => {
    const subject = requireConversationSubject(deps, args.conversationId)
    return {
      title: 'Marquer comme lu',
      summary: `Marquer comme lu : ${subject}`,
      effect: 'Le mail sera marque comme lu.',
    }
  },
  execute: async (args) => {
    await deps.providerConnections.markImapConversationRead(args.conversationId, true)
    return { ok: true, summary: 'Mail marque comme lu.' }
  },
})

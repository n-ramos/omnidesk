import { z } from 'zod'
import type { AiToolDefinition } from '@shared/ai'
import { requireConversationSubject, type MailActionDeps } from './mailContext'

const schema = z.object({
  conversationId: z.string().uuid().describe('Identifiant du mail a supprimer (issu de mail.list_messages).'),
})

type Args = z.infer<typeof schema>

// mail.delete : mutante -> confirmation. Envoie un mail vers la corbeille.
export const createMailDeleteAction = (deps: MailActionDeps): AiToolDefinition<Args> => ({
  name: 'mail.delete',
  description: 'Supprime un mail (le deplace vers la corbeille).',
  parameters: schema,
  mutating: true,
  category: 'mail',
  preview: async (args) => {
    const subject = requireConversationSubject(deps, args.conversationId)
    return {
      title: 'Supprimer le mail',
      summary: `Supprimer "${subject}"`,
      effect: 'Le mail sera deplace vers la corbeille.',
    }
  },
  execute: async (args) => {
    await deps.providerConnections.deleteImapConversation(args.conversationId)
    return { ok: true, summary: 'Mail supprime (deplace vers la corbeille).' }
  },
})

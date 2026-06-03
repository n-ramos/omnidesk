import { z } from 'zod'
import type { AiToolDefinition } from '@shared/ai'
import { requireImapAccount, type MailActionDeps } from './mailContext'

const schema = z.object({
  unreadOnly: z.boolean().optional().describe('Limiter aux mails non lus.'),
  query: z.string().trim().max(160).optional().describe('Filtre texte (expediteur, objet...).'),
  limit: z.number().int().min(1).max(30).optional().describe('Nombre maximum de mails (defaut 15).'),
})

type Args = z.infer<typeof schema>

// mail.list_messages : lecture seule. Renvoie des conversationId que les actions mutantes
// (mark_read, move, delete) reutilisent ensuite.
export const createMailListMessagesAction = (deps: MailActionDeps): AiToolDefinition<Args> => ({
  name: 'mail.list_messages',
  description:
    'Liste les mails recents de la boite de l\'utilisateur (objet, expediteur, apercu, lu/non lu). Renvoie un conversationId par mail, a reutiliser pour marquer lu, deplacer ou supprimer.',
  parameters: schema,
  mutating: false,
  category: 'mail',
  execute: async (args) => {
    const account = requireImapAccount(deps)
    const conversations = deps.conversations.list({
      accountId: account.id,
      unreadOnly: args.unreadOnly,
      query: args.query,
    })
    const messages = conversations.slice(0, args.limit ?? 15).map((conversation) => ({
      conversationId: conversation.id,
      from: conversation.lastSenderName ?? conversation.lastSenderAddress ?? 'inconnu',
      subject: conversation.subject ?? conversation.title,
      preview: conversation.lastMessagePreview ?? '',
      unread: conversation.unreadCount > 0,
      date: conversation.lastMessageAt ?? null,
    }))
    return {
      ok: true,
      summary: `${messages.length} mail(s) trouve(s).`,
      data: { messages },
    }
  },
})

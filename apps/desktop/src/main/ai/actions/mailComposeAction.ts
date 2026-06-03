import { z } from 'zod'
import type { AiToolDefinition } from '@shared/ai'
import { requireImapAccount, truncate, type MailActionDeps } from './mailContext'

const schema = z.object({
  to: z.array(z.string().trim().email()).min(1).max(50).describe('Destinataires (adresses email).'),
  cc: z.array(z.string().trim().email()).max(50).optional().describe('Copie (optionnel).'),
  subject: z.string().trim().min(1).max(400).describe('Objet du mail.'),
  body: z.string().min(1).max(50000).describe('Corps du mail, en texte brut.'),
})

type Args = z.infer<typeof schema>

// mail.compose : redige et ENVOIE un mail. Mutante -> apercu + confirmation obligatoires.
// (L'IMAP n'expose pas de mode brouillon ; l'envoi reel n'a lieu qu'apres validation.)
export const createMailComposeAction = (deps: MailActionDeps): AiToolDefinition<Args> => ({
  name: 'mail.compose',
  description:
    "Redige et envoie un mail depuis le compte de l'utilisateur. L'envoi n'a lieu qu'apres confirmation explicite de l'utilisateur. A utiliser pour ecrire ou repondre a un message.",
  parameters: schema,
  mutating: true,
  category: 'mail',
  preview: async (args) => {
    const account = requireImapAccount(deps)
    const details = [
      { label: 'De', value: account.emailAddress ?? account.label },
      { label: 'A', value: args.to.join(', ') },
    ]
    if (args.cc?.length) {
      details.push({ label: 'Cc', value: args.cc.join(', ') })
    }
    details.push({ label: 'Objet', value: args.subject })
    details.push({ label: 'Message', value: truncate(args.body, 800) })
    return {
      title: 'Envoyer un mail',
      summary: `Envoyer un mail a ${args.to.join(', ')}`,
      details,
      effect: 'Ce mail sera ENVOYE immediatement apres votre validation.',
    }
  },
  execute: async (args) => {
    const account = requireImapAccount(deps)
    const result = await deps.providerConnections.composeMail({
      accountId: account.id,
      to: args.to,
      cc: args.cc,
      subject: args.subject,
      body: args.body,
    })
    return {
      ok: true,
      summary: `Mail envoye a ${args.to.join(', ')}.`,
      data: { externalMessageId: result.externalMessageId },
    }
  },
})

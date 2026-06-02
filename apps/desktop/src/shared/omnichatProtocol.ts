import { z } from 'zod'

// Miroir cote desktop du protocole de signalisation OmniChat defini dans le projet
// voisin OmniProxy (src/services/omnichatProtocol.ts). Le process main ne peut pas
// importer le repo voisin : on duplique donc les types ici, en restant strictement
// aligne. Les enveloppes SORTANTES (client -> serveur) sont construites typees ;
// les enveloppes ENTRANTES (serveur -> client) sont validees par Zod a la reception
// (le serveur les construit sans schema, le client doit donc se proteger).
//
// IMPORTANT : garder ce fichier synchronise avec OmniProxy. Toute evolution du
// protocole (ex. historique/backlog en M2) doit etre repercutee des deux cotes.

export const OMNICHAT_PROTOCOL_VERSION = 1

// Bornes defensives (memes valeurs que cote serveur).
export const LIMITS = {
  userId: 200,
  displayName: 80,
  groupId: 200,
  groupTitle: 160,
  body: 8000,
  members: 64,
  attachmentsPerMessage: 3,
  controlEnvelopeBytes: 64 * 1024,
  historyPage: 100,
  // Nombre max d'identifiants de contacts surveillables (presence) par 'watch'.
  watchIds: 500,
} as const

// --- Cible d'un message / appel ------------------------------------------
export const targetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('dm'), userId: z.string().min(1).max(LIMITS.userId) }),
  z.object({ kind: z.literal('group'), groupId: z.string().min(1).max(LIMITS.groupId) }),
])
export type Target = z.infer<typeof targetSchema>

// --- Piece jointe : metadonnee seulement ---------------------------------
export const attachmentRefSchema = z.object({
  attId: z.string().min(1).max(200),
  name: z.string().min(1).max(255),
  mime: z.string().min(1).max(160),
  size: z.number().int().nonnegative(),
  chunks: z.number().int().positive().max(4096),
})
export type AttachmentRef = z.infer<typeof attachmentRefSchema>

const callMediaSchema = z.enum(['audio', 'video'])
const callDeclineReasonSchema = z.enum(['busy', 'declined', 'timeout', 'unavailable'])
export type CallMedia = z.infer<typeof callMediaSchema>
export type CallDeclineReason = z.infer<typeof callDeclineReasonSchema>

// --- Enveloppes client -> serveur (construites par le client) -------------
export const clientEnvelopeSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('hello'),
    userId: z.string().min(1).max(LIMITS.userId),
    displayName: z.string().min(1).max(LIMITS.displayName),
    protocol: z.literal(OMNICHAT_PROTOCOL_VERSION),
    auth: z.string().min(1).max(512).optional(),
  }),
  z.object({
    t: z.literal('msg'),
    to: targetSchema,
    clientMsgId: z.string().min(1).max(200),
    kind: z.literal('text').default('text'),
    body: z.string().max(LIMITS.body),
    attachments: z.array(attachmentRefSchema).max(LIMITS.attachmentsPerMessage).optional(),
    members: z.array(z.string().min(1).max(LIMITS.userId)).max(LIMITS.members).optional(),
  }),
  z.object({
    t: z.literal('history-req'),
    to: targetSchema,
    before: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(LIMITS.historyPage).default(50),
  }),
  z.object({
    t: z.literal('receipt'),
    to: targetSchema,
    serverMsgId: z.string().min(1).max(200),
    state: z.enum(['delivered', 'read']),
  }),
  z.object({
    t: z.literal('typing'),
    to: targetSchema,
    state: z.enum(['start', 'stop']),
  }),
  // Reaction (emoji) sur un message : ajout/retrait, relaye au pair/groupe (non persiste serveur).
  z.object({
    t: z.literal('reaction'),
    to: targetSchema,
    serverMsgId: z.string().min(1).max(200),
    name: z.string().min(1).max(100),
    op: z.enum(['add', 'remove']),
  }),
  z.object({
    t: z.literal('group-create'),
    groupId: z.string().min(1).max(LIMITS.groupId),
    title: z.string().min(1).max(LIMITS.groupTitle),
    members: z.array(z.string().min(1).max(LIMITS.userId)).min(1).max(LIMITS.members),
  }),
  z.object({
    t: z.literal('group-update'),
    groupId: z.string().min(1).max(LIMITS.groupId),
    title: z.string().min(1).max(LIMITS.groupTitle).optional(),
    addMembers: z.array(z.string().min(1).max(LIMITS.userId)).max(LIMITS.members).optional(),
    removeMembers: z.array(z.string().min(1).max(LIMITS.userId)).max(LIMITS.members).optional(),
  }),
  z.object({ t: z.literal('group-join'), groupId: z.string().min(1).max(LIMITS.groupId) }),
  z.object({
    t: z.literal('call-invite'),
    to: targetSchema,
    callId: z.string().min(1).max(200),
    room: z.string().min(1).max(200),
    media: callMediaSchema,
  }),
  z.object({ t: z.literal('call-accept'), to: targetSchema, callId: z.string().min(1).max(200) }),
  z.object({
    t: z.literal('call-decline'),
    to: targetSchema,
    callId: z.string().min(1).max(200),
    reason: callDeclineReasonSchema.optional(),
  }),
  z.object({ t: z.literal('call-cancel'), to: targetSchema, callId: z.string().min(1).max(200) }),
  // Declare (active=true) / retire (active=false) un appel ad-hoc comme "appel du groupe" :
  // les membres recoivent une notification passive 'call-active' (bouton Rejoindre, pas de ring).
  z.object({
    t: z.literal('call-group'),
    groupId: z.string().min(1).max(LIMITS.groupId),
    callId: z.string().min(1).max(200),
    room: z.string().min(1).max(200),
    active: z.boolean(),
  }),
  // Abonnement presence (modele contacts) : declare les identifiants des contacts
  // dont on veut suivre l'etat en ligne. Le serveur ne pousse la presence QUE pour
  // ces identifiants (plus d'annuaire global). Renvoye a chaque (re)connexion et a
  // chaque ajout/retrait de contact.
  z.object({
    t: z.literal('watch'),
    userIds: z.array(z.string().min(1).max(LIMITS.userId)).max(LIMITS.watchIds),
  }),
  z.object({ t: z.literal('ping') }),
  z.object({ t: z.literal('pong') }),
])
export type ClientEnvelope = z.infer<typeof clientEnvelopeSchema>

// --- Pair (annuaire / presence) ------------------------------------------
export const peerSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  online: z.boolean(),
})
export type Peer = z.infer<typeof peerSchema>

// --- Enveloppes serveur -> client (validees a la reception) ---------------
const msgInSchema = z.object({
  t: z.literal('msg-in'),
  from: z.string(),
  to: targetSchema,
  clientMsgId: z.string(),
  serverMsgId: z.string(),
  serverTs: z.string(),
  // seq : ordre monotone par conversation (store-and-forward). Optionnel pour
  // tolerer un serveur anterieur.
  seq: z.number().optional(),
  kind: z.literal('text'),
  body: z.string(),
  attachments: z.array(attachmentRefSchema).optional(),
})

export const serverEnvelopeSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('welcome'),
    you: z.object({ userId: z.string(), displayName: z.string() }),
    // Optionnel : en modele contacts-scope le serveur n'envoie plus d'annuaire global.
    // La presence des contacts arrive via 'directory'/'presence' apres le 'watch'.
    roster: z.array(peerSchema).optional(),
    serverTs: z.string(),
  }),
  z.object({ t: z.literal('directory'), roster: z.array(peerSchema) }),
  z.object({
    t: z.literal('presence'),
    userId: z.string(),
    displayName: z.string(),
    online: z.boolean(),
  }),
  msgInSchema,
  z.object({
    t: z.literal('msg-ack'),
    clientMsgId: z.string(),
    serverMsgId: z.string(),
    serverTs: z.string(),
    status: z.enum(['relayed', 'no-recipient']),
  }),
  z.object({
    t: z.literal('receipt-in'),
    from: z.string(),
    to: targetSchema,
    serverMsgId: z.string(),
    state: z.enum(['delivered', 'read']),
  }),
  z.object({
    t: z.literal('typing-in'),
    from: z.string(),
    to: targetSchema,
    state: z.enum(['start', 'stop']),
  }),
  z.object({
    t: z.literal('reaction-in'),
    from: z.string(),
    to: targetSchema,
    serverMsgId: z.string(),
    name: z.string(),
    op: z.enum(['add', 'remove']),
  }),
  z.object({
    t: z.literal('group-invite'),
    from: z.string(),
    groupId: z.string(),
    title: z.string(),
    members: z.array(z.string()),
  }),
  z.object({
    t: z.literal('group-update-in'),
    from: z.string(),
    groupId: z.string(),
    title: z.string().optional(),
    addMembers: z.array(z.string()).optional(),
    removeMembers: z.array(z.string()).optional(),
  }),
  z.object({
    t: z.literal('call-ring'),
    from: z.string(),
    // Pseudo de l'appelant, rempli par le serveur (depuis son hello). Permet d'afficher
    // un nom meme si l'appelant n'est ni un contact ni un membre de groupe commun.
    fromPseudo: z.string().optional(),
    to: targetSchema,
    callId: z.string(),
    room: z.string(),
    media: callMediaSchema,
  }),
  z.object({ t: z.literal('call-accepted'), from: z.string(), callId: z.string() }),
  z.object({
    t: z.literal('call-declined'),
    from: z.string(),
    callId: z.string(),
    reason: callDeclineReasonSchema.optional(),
  }),
  z.object({ t: z.literal('call-canceled'), from: z.string(), callId: z.string() }),
  z.object({
    t: z.literal('call-active'),
    groupId: z.string(),
    callId: z.string(),
    room: z.string(),
    from: z.string(),
    fromPseudo: z.string().optional(),
    active: z.boolean(),
  }),
  z.object({
    t: z.literal('history-page'),
    to: targetSchema,
    hasMore: z.boolean(),
    messages: z.array(
      z.object({
        from: z.string(),
        serverMsgId: z.string(),
        clientMsgId: z.string(),
        serverTs: z.string(),
        seq: z.number(),
        kind: z.literal('text'),
        body: z.string(),
      }),
    ),
  }),
  z.object({ t: z.literal('sync-begin'), targets: z.number() }),
  z.object({ t: z.literal('sync-end') }),
  z.object({ t: z.literal('pong') }),
  z.object({ t: z.literal('error'), code: z.string(), message: z.string(), ref: z.string().optional() }),
])
export type ServerEnvelope = z.infer<typeof serverEnvelopeSchema>

// Raccourcis de types entrants utiles aux consommateurs (services main, store).
export type MsgInEnvelope = z.infer<typeof msgInSchema>

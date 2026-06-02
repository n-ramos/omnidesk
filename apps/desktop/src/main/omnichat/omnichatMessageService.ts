import type { Database } from 'better-sqlite3'
import type { MessageSummary, UUID } from '@shared/models'
import type { MsgInEnvelope, Target } from '@shared/omnichatProtocol'
import { ConversationRepository } from '@main/database/repositories/conversationRepository'
import { MessageRepository } from '@main/database/repositories/messageRepository'

const PROVIDER_ID = 'omnichat'

// Convention d'identifiants externes locaux (propres a cette installation) :
//   - groupe : "group:<groupId>"
//   - DM     : "dm:<emailA>|<emailB>" (paire triee, insensible a la casse) — ainsi
//     mon message sortant et le message entrant du meme pair tombent sur la meme
//     conversation locale. (Cote serveur, OmniProxy a sa propre cle ; sans rapport.)
export const groupExternalId = (groupId: string): string => `group:${groupId}`
export const dmExternalId = (a: string, b: string): string =>
  `dm:${[a.toLowerCase(), b.toLowerCase()].sort().join('|')}`

export interface OmnichatSelfContext {
  // Identifiant unique (le "hash" facon Discord), userId au niveau transport.
  userId: string
  displayName: string
  accountId: UUID
}

export interface PersistedMessageResult {
  message: MessageSummary
  conversationId: UUID
  conversationKind: 'dm' | 'group'
  isOutgoing: boolean
}

export class OmnichatMessageService {
  private readonly conversations: ConversationRepository
  private readonly messages: MessageRepository

  constructor(db: Database) {
    this.conversations = new ConversationRepository(db)
    this.messages = new MessageRepository(db)
  }

  private resolveTarget(
    self: OmnichatSelfContext,
    target: Target,
    from: string,
  ): { externalConversationId: string; kind: 'dm' | 'group'; peerEmail?: string } {
    if (target.kind === 'group') {
      return { externalConversationId: groupExternalId(target.groupId), kind: 'group' }
    }
    // En DM, le "pair" est l'autre partie : si c'est moi qui emets, c'est la cible ;
    // sinon c'est l'emetteur.
    const peerEmail = from.toLowerCase() === self.userId.toLowerCase() ? target.userId : from
    return { externalConversationId: dmExternalId(self.userId, peerEmail), kind: 'dm', peerEmail }
  }

  // Persiste un message entrant (msg-in). Idempotent par serverMsgId : renvoie null
  // si deja connu (redelivraison / chevauchement de backlog).
  applyIncoming(
    self: OmnichatSelfContext,
    env: MsgInEnvelope,
    senderDisplayName?: string,
    titleHint?: string,
  ): PersistedMessageResult | null {
    if (this.messages.hasExternalMessage(self.accountId, PROVIDER_ID, env.serverMsgId)) {
      return null
    }

    const resolved = this.resolveTarget(self, env.to, env.from)
    const isOutgoing = env.from.toLowerCase() === self.userId.toLowerCase()
    const title =
      titleHint
      ?? (resolved.kind === 'dm'
        ? senderDisplayName || resolved.peerEmail || 'Message direct'
        : 'Groupe')

    const conversationId = this.conversations.ensureNativeConversation({
      accountId: self.accountId,
      externalConversationId: resolved.externalConversationId,
      title,
      kind: resolved.kind,
    })

    const message = isOutgoing
      ? this.messages.insertOutgoing({
          accountId: self.accountId,
          providerId: PROVIDER_ID,
          conversationId,
          externalMessageId: env.serverMsgId,
          body: env.body,
          senderName: self.displayName,
          senderAddress: self.userId,
          sentAt: env.serverTs,
        })
      : this.messages.insertIncomingNative({
          accountId: self.accountId,
          providerId: PROVIDER_ID,
          conversationId,
          externalMessageId: env.serverMsgId,
          body: env.body,
          senderName: senderDisplayName ?? env.from,
          senderAddress: env.from,
          receivedAt: env.serverTs,
          isUnread: true,
        })

    return { message, conversationId, conversationKind: resolved.kind, isOutgoing }
  }

  // Insere notre propre message au moment de l'envoi (optimiste), identifie
  // temporairement par clientMsgId jusqu'au msg-ack.
  recordOutgoing(
    self: OmnichatSelfContext,
    target: Target,
    clientMsgId: string,
    body: string,
    sentAt: string,
    peerDisplayName?: string,
  ): PersistedMessageResult {
    const resolved = this.resolveTarget(self, target, self.userId)
    const title =
      resolved.kind === 'dm'
        ? peerDisplayName || resolved.peerEmail || 'Message direct'
        : 'Groupe'

    const conversationId = this.conversations.ensureNativeConversation({
      accountId: self.accountId,
      externalConversationId: resolved.externalConversationId,
      title,
      kind: resolved.kind,
    })

    const message = this.messages.insertOutgoing({
      accountId: self.accountId,
      providerId: PROVIDER_ID,
      conversationId,
      externalMessageId: clientMsgId,
      body,
      senderName: self.displayName,
      senderAddress: self.userId,
      sentAt,
    })

    return { message, conversationId, conversationKind: resolved.kind, isOutgoing: true }
  }

  reconcileAck(
    self: OmnichatSelfContext,
    clientMsgId: string,
    serverMsgId: string,
    serverTs: string,
  ): void {
    this.messages.reconcileSentNative(self.accountId, PROVIDER_ID, clientMsgId, serverMsgId, serverTs)
  }

  // Cree (ou retrouve) la conversation DM avec un pair, et l'inscrit comme
  // participant. Utilise quand on demarre un DM depuis le roster.
  ensureDm(
    self: OmnichatSelfContext,
    peerEmailRaw: string,
    peerDisplayName?: string,
  ): { conversationId: UUID } {
    const peerEmail = peerEmailRaw.trim().toLowerCase()
    const externalConversationId = dmExternalId(self.userId, peerEmail)
    const conversationId = this.conversations.ensureNativeConversation({
      accountId: self.accountId,
      externalConversationId,
      title: peerDisplayName || peerEmail,
      kind: 'dm',
    })
    this.conversations.setParticipants(conversationId, [
      { displayName: peerDisplayName ?? peerEmail, address: peerEmail },
    ])
    return { conversationId }
  }

  // Cree/retrouve la conversation de groupe locale et fixe ses membres. Sert a la
  // fois pour la creation (cote createur) et la reception d'une invitation.
  applyGroupInvite(
    self: OmnichatSelfContext,
    groupId: string,
    title: string,
    members: string[],
  ): { conversationId: UUID } {
    const conversationId = this.conversations.ensureNativeConversation({
      accountId: self.accountId,
      externalConversationId: groupExternalId(groupId),
      title,
      kind: 'group',
    })
    this.conversations.updateNativeTitle(conversationId, title)
    this.conversations.setParticipants(
      conversationId,
      members.map((email) => ({ address: email, displayName: email })),
    )
    return { conversationId }
  }

  // Applique une mise a jour de groupe (titre et/ou membres). null si inconnu.
  applyGroupUpdate(
    self: OmnichatSelfContext,
    groupId: string,
    title?: string,
    addMembers?: string[],
    removeMembers?: string[],
  ): { conversationId: UUID } | null {
    const ref = this.conversations.findByExternal(self.accountId, groupExternalId(groupId))
    if (!ref) {
      return null
    }
    if (title) {
      this.conversations.updateNativeTitle(ref.conversationId, title)
    }
    if (addMembers && addMembers.length > 0) {
      this.conversations.addParticipants(
        ref.conversationId,
        addMembers.map((email) => ({ address: email, displayName: email })),
      )
    }
    if (removeMembers && removeMembers.length > 0) {
      this.conversations.removeParticipants(ref.conversationId, removeMembers)
    }
    return { conversationId: ref.conversationId }
  }

  // Membres (emails) d'une conversation de groupe, pour l'auto-reparation cote
  // serveur (le champ `members` accompagne chaque msg de groupe).
  groupMemberEmails(conversationId: UUID): string[] {
    return this.conversations.listParticipantAddresses(conversationId)
  }

  // Supprime localement une conversation (ex. quand on quitte un groupe ou qu'on
  // en est retire). Les messages partent en cascade (FK ON DELETE CASCADE).
  deleteLocalConversation(conversationId: UUID): void {
    this.conversations.deleteById(conversationId)
  }

  // Room LiveKit PARTAGEE pour une conversation : derivee de l'external id
  // (dm:a|b ou group:gid), donc identique chez les deux pairs (l'id local differe).
  roomForConversation(conversationId: UUID): string | null {
    const ref = this.conversations.getProviderRef(conversationId)
    if (!ref || ref.providerId !== PROVIDER_ID) {
      return null
    }
    return `omnichat:${ref.externalConversationId}`
  }

  // Retrouve la conversation locale visee par une enveloppe entrante (typing-in,
  // receipt-in) a partir de l'emetteur + de la cible. null si inconnue.
  localConversationId(self: OmnichatSelfContext, from: string, to: Target): UUID | null {
    let externalConversationId: string
    if (to.kind === 'group') {
      externalConversationId = groupExternalId(to.groupId)
    } else {
      const peer = from.toLowerCase() === self.userId.toLowerCase() ? to.userId : from
      externalConversationId = dmExternalId(self.userId, peer)
    }
    return this.conversations.findByExternal(self.accountId, externalConversationId)?.conversationId ?? null
  }

  // Reconstruit la cible WS (Target) a partir d'une conversation locale, via son
  // external_conversation_id. Retourne null si ce n'est pas une conversation native.
  targetForConversation(self: OmnichatSelfContext, conversationId: UUID): Target | null {
    const ref = this.conversations.getProviderRef(conversationId)
    if (!ref || ref.providerId !== PROVIDER_ID) {
      return null
    }
    const ext = ref.externalConversationId
    if (ext.startsWith('group:')) {
      return { kind: 'group', groupId: ext.slice('group:'.length) }
    }
    if (ext.startsWith('dm:')) {
      const pair = ext.slice('dm:'.length).split('|')
      const peer = pair.find((email) => email.toLowerCase() !== self.userId.toLowerCase()) ?? pair[0]
      return peer ? { kind: 'dm', userId: peer } : null
    }
    return null
  }

  // Cible WS a partir d'un external_conversation_id (dm:a|b / group:gid) — utilise pour
  // les reactions (le contexte ne fournit que l'external id, pas la conversation locale).
  targetFromExternal(self: OmnichatSelfContext, externalConversationId: string): Target | null {
    if (externalConversationId.startsWith('group:')) {
      return { kind: 'group', groupId: externalConversationId.slice('group:'.length) }
    }
    if (externalConversationId.startsWith('dm:')) {
      const pair = externalConversationId.slice('dm:'.length).split('|')
      const peer = pair.find((email) => email.toLowerCase() !== self.userId.toLowerCase()) ?? pair[0]
      return peer ? { kind: 'dm', userId: peer } : null
    }
    return null
  }

  // Conversation locale d'un groupe a partir de son groupId (pour le bouton Rejoindre).
  localGroupConversationId(self: OmnichatSelfContext, groupId: string): UUID | null {
    return (
      this.conversations.findByExternal(self.accountId, groupExternalId(groupId))?.conversationId ?? null
    )
  }

  // Applique une reaction entrante (reaction-in) sur le message local correspondant.
  // null si le message n'est pas (encore) connu localement.
  applyIncomingReaction(
    self: OmnichatSelfContext,
    from: string,
    serverMsgId: string,
    name: string,
    op: 'add' | 'remove',
  ): { conversationId: UUID } | null {
    const found = this.messages.findIdByExternal(self.accountId, PROVIDER_ID, serverMsgId)
    if (!found) {
      return null
    }
    if (op === 'add') {
      this.messages.addReaction(found.id, name, from, false)
    } else {
      this.messages.removeReaction(found.id, name, from)
    }
    return { conversationId: found.conversationId }
  }
}

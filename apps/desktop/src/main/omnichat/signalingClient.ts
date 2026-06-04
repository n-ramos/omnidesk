import { randomUUID } from 'node:crypto'
import WebSocket, { type RawData } from 'ws'
import type { Database } from 'better-sqlite3'
import { appConfig } from '@main/config/env'
import { eventBus } from '@main/events/eventBus'
import { logger } from '@main/logger'
import { AppError } from '@shared/errors'
import type { MessageSummary, OmnichatContact } from '@shared/models'
import {
  LIMITS,
  OMNICHAT_PROTOCOL_VERSION,
  serverEnvelopeSchema,
  type ClientEnvelope,
  type Peer,
  type ServerEnvelope,
} from '@shared/omnichatProtocol'
import { omniProxyClient } from '@main/proxy/omniProxyClient'
import { accountAuthService } from '@main/account/accountAuthService'
import {
  OmnichatIdentityService,
  type ResolvedOmnichatIdentity,
} from './omnichatIdentityService'
import { OmnichatMessageService, type OmnichatSelfContext } from './omnichatMessageService'
import {
  OmnichatContactRepository,
  type StoredOmnichatContact,
} from '@main/database/repositories/omnichatContactRepository'

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000
const PING_INTERVAL_MS = 25_000
const PONG_TIMEOUT_MS = 10_000

// Coalescence des re-`watch` (ouverture de groupe / changements de membres) pour ne pas
// marteler le bucket de debit `watch` du serveur lors de rafales.
const WATCH_DEBOUNCE_MS = 800

// readyState OPEN (evite d'importer la valeur runtime).
const WS_OPEN = 1

// Client WebSocket du process main vers la signalisation OmniChat d'OmniProxy.
// Vit cote main (la CSP du renderer interdit ce socket) ; le renderer passe par
// IPC. Persiste les messages entrants en local et relaie l'etat via eventBus
// (-> webContents.send dans main/index.ts). Reconnexion automatique + heartbeat.
export class SignalingClient {
  private identityService?: OmnichatIdentityService
  private messageService?: OmnichatMessageService

  private socket?: WebSocket
  private identity: ResolvedOmnichatIdentity | null = null
  private contactRepo?: OmnichatContactRepository
  // Contacts persistants (miroir DB), keyes par identifiant lowercased ; et l'ensemble
  // EPHEMERE des contacts actuellement en ligne (derive de la presence serveur, jamais
  // de la DB). La liste reste donc visible hors-ligne (online=false pour tous).
  private readonly contacts = new Map<string, StoredOmnichatContact>()
  private readonly onlineIds = new Set<string>()
  // Membres du groupe actuellement ouvert (presence a la demande) ; pseudos vus en
  // presence (afficher un nom meme hors contacts) ; ensemble effectivement surveille
  // (contacts ∪ groupe ouvert, borne) ; minuteur de coalescence du watch.
  private activeGroupConversationId: string | null = null
  private activeGroupMemberIds = new Set<string>()
  private readonly knownPseudos = new Map<string, string>()
  private watchedIds = new Set<string>()
  private watchTimer?: ReturnType<typeof setTimeout>
  private ready = false
  private stopped = true
  private reconnectAttempt = 0
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private pingTimer?: ReturnType<typeof setInterval>
  private pongTimer?: ReturnType<typeof setTimeout>

  init(db: Database): void {
    this.identityService = new OmnichatIdentityService(db)
    this.messageService = new OmnichatMessageService(db)
    this.contactRepo = new OmnichatContactRepository(db)
    this.loadContacts()
  }

  // Demarre la connexion si OmniProxy est configure ET qu'une identite (email)
  // est resolvable. Sinon reste hors-ligne (la vue Omnichat affiche l'etat).
  start(): void {
    this.stopped = false
    if (!this.identityService || !omniProxyClient.isConfigured()) {
      this.emitConnection(false)
      return
    }
    this.identity = this.identityService.resolve()
    if (!this.identity) {
      logger.info('omnichat: aucune session de compte - signalisation inactive')
      this.emitConnection(false)
      return
    }
    this.connect()
  }

  stop(): void {
    this.stopped = true
    this.clearTimers()
    this.ready = false
    if (this.socket) {
      try {
        this.socket.removeAllListeners()
        this.socket.terminate()
      } catch {
        // ignore
      }
      this.socket = undefined
    }
    // On garde les contacts (persistants) mais on remet tout le monde hors-ligne.
    this.onlineIds.clear()
    this.emitConnection(false)
  }

  // Rejoue identite + reconnecte (ex. apres changement d'identite dans les reglages).
  restart(): void {
    this.stop()
    this.start()
  }

  isConnected(): boolean {
    return this.ready
  }

  currentIdentity(): ResolvedOmnichatIdentity | null {
    return this.identity
  }

  // Contacts persistants joints a leur etat en ligne (surcouche ephemere). Source de la
  // liste affichee dans le rail ; l'online se met a jour via les evenements de presence.
  listContacts(): OmnichatContact[] {
    return [...this.contacts.values()]
      .map((contact) => ({
        ...contact,
        // Affiche le displayName (pseudo) vu en presence/roster si connu, jamais l'email.
        // Repli sur le libelle local saisi a l'ajout tant que le pair n'a pas ete vu.
        pseudo: this.knownPseudos.get(contact.id) ?? contact.pseudo,
        online: this.onlineIds.has(contact.id),
      }))
      .sort((left, right) => left.pseudo.localeCompare(right.pseudo))
  }

  // Ajoute (ou met a jour le pseudo d') un contact, re-watch, et notifie le renderer.
  // Fonctionne hors-ligne : le watch part a la prochaine (re)connexion (cf. 'welcome').
  addContact(pseudo: string, id: string): OmnichatContact {
    if (!this.contactRepo) {
      throw new AppError('PROVIDER_UNAVAILABLE', 'Omnichat non initialise.')
    }
    const stored = this.contactRepo.add(id, pseudo)
    this.contacts.set(stored.id, stored)
    this.sendWatch()
    this.emitPresence()
    return { ...stored, online: this.onlineIds.has(stored.id) }
  }

  removeContact(id: string): void {
    if (!this.contactRepo) {
      return
    }
    const key = id.trim().toLowerCase()
    this.contactRepo.remove(key)
    this.contacts.delete(key)
    this.onlineIds.delete(key)
    this.sendWatch()
    this.emitPresence()
  }

  private loadContacts(): void {
    if (!this.contactRepo) {
      return
    }
    this.contacts.clear()
    for (const contact of this.contactRepo.list()) {
      this.contacts.set(contact.id, contact)
    }
  }

  // Ensemble surveille = contacts ∪ membres du groupe ouvert, hors soi, borne a
  // LIMITS.watchIds (un depassement ferait rejeter TOUT le watch cote serveur).
  private computeWatchedIds(): string[] {
    const selfId = this.identity?.id.toLowerCase()
    const ids = new Set<string>()
    for (const id of this.contacts.keys()) {
      ids.add(id)
    }
    for (const id of this.activeGroupMemberIds) {
      ids.add(id)
    }
    if (selfId) {
      ids.delete(selfId)
    }
    return [...ids].slice(0, LIMITS.watchIds)
  }

  // Declare au serveur les identifiants a surveiller (presence). No-op hors-ligne ;
  // re-emis au welcome, a l'ajout/retrait de contact, et (debounce) aux changements de groupe.
  private sendWatch(): void {
    if (!this.ready) {
      return
    }
    const ids = this.computeWatchedIds()
    this.watchedIds = new Set(ids)
    this.send({ t: 'watch', userIds: ids })
  }

  // Re-watch coalesce : evite de marteler le bucket de debit `watch` du serveur.
  private scheduleWatch(): void {
    if (this.watchTimer) {
      clearTimeout(this.watchTimer)
    }
    this.watchTimer = setTimeout(() => {
      this.watchTimer = undefined
      this.sendWatch()
    }, WATCH_DEBOUNCE_MS)
  }

  // Presence a la demande : le renderer signale le groupe ouvert -> on surveille ses
  // membres (en plus des contacts) tant qu'il est affiche. null = aucun groupe ouvert.
  watchGroup(conversationId: string | null): void {
    this.activeGroupConversationId = conversationId
    this.refreshActiveGroup()
  }

  // Recalcule les membres du groupe ouvert (depuis les participants locaux) puis
  // re-watch. Rappele aux evenements de groupe pour suivre les ajouts/retraits a chaud.
  private refreshActiveGroup(): void {
    const next = new Set<string>()
    const self = this.currentSelf()
    if (this.activeGroupConversationId && self && this.messageService) {
      const selfId = self.userId.toLowerCase()
      for (const id of this.messageService.groupMemberEmails(this.activeGroupConversationId)) {
        const lc = id.toLowerCase()
        if (lc !== selfId) {
          next.add(lc)
        }
      }
    }
    this.activeGroupMemberIds = next
    this.scheduleWatch()
    this.emitPresence()
  }

  // --- Envoi (appele par les handlers IPC) -------------------------------
  // Demarre (ou retrouve) un DM avec un pair ; ne necessite pas d'etre connecte
  // (la conversation locale peut exister hors-ligne).
  openDm(peerEmail: string): { conversationId: string } {
    const self = this.identitySelf()
    return this.messageService!.ensureDm(self, peerEmail, this.displayNameFor(peerEmail))
  }

  // Envoie un message dans une conversation existante (DM ou groupe). La cible WS
  // est reconstruite cote main depuis l'external_conversation_id.
  sendToConversation(conversationId: string, body: string): MessageSummary {
    const self = this.requireSelf()
    const target = this.messageService!.targetForConversation(self, conversationId)
    if (!target) {
      throw new AppError('PROVIDER_UNAVAILABLE', 'Conversation omnichat introuvable.')
    }
    const clientMsgId = randomUUID()
    const sentAt = new Date().toISOString()
    const peerDisplayName = target.kind === 'dm' ? this.displayNameFor(target.userId) : undefined

    // Insertion optimiste locale (le serveur ne renvoie pas notre propre msg-in
    // sur la meme connexion ; on l'affiche donc immediatement).
    const result = this.messageService!.recordOutgoing(
      self,
      target,
      clientMsgId,
      body,
      sentAt,
      peerDisplayName,
    )

    // Pour un groupe, on joint la liste des membres (auto-reparation cote serveur :
    // le hub re-affirme l'appartenance a partir de chaque message de groupe).
    const members =
      target.kind === 'group' ? this.messageService!.groupMemberEmails(conversationId) : undefined
    this.send({ t: 'msg', to: target, clientMsgId, kind: 'text', body, ...(members ? { members } : {}) })
    return result.message
  }

  // Cree un groupe : genere l'id, cree la conversation locale, et diffuse
  // group-create (le serveur invite les membres). Renvoie la conversation locale.
  createGroup(title: string, memberEmails: string[]): { conversationId: string } {
    const self = this.requireSelf()
    const groupId = randomUUID()
    const members = Array.from(
      new Set([self.userId, ...memberEmails.map((entry) => entry.trim().toLowerCase()).filter(Boolean)]),
    )
    const { conversationId } = this.messageService!.applyGroupInvite(self, groupId, title, members)
    this.send({ t: 'group-create', groupId, title, members })
    return { conversationId }
  }

  // Saisie en cours (best-effort : silencieux si hors-ligne).
  sendTyping(conversationId: string, state: 'start' | 'stop'): void {
    const self = this.currentSelf()
    if (!this.ready || !self || !this.messageService) {
      return
    }
    const target = this.messageService.targetForConversation(self, conversationId)
    if (target) {
      this.send({ t: 'typing', to: target, state })
    }
  }

  // Accuse de reception/lecture pour un message (best-effort).
  sendReceipt(conversationId: string, serverMsgId: string, state: 'delivered' | 'read'): void {
    const self = this.currentSelf()
    if (!this.ready || !self || !this.messageService) {
      return
    }
    const target = this.messageService.targetForConversation(self, conversationId)
    if (target) {
      this.send({ t: 'receipt', to: target, serverMsgId, state })
    }
  }

  updateGroup(
    conversationId: string,
    patch: { title?: string; addMembers?: string[]; removeMembers?: string[] },
  ): { ok: true } {
    const self = this.requireSelf()
    const target = this.messageService!.targetForConversation(self, conversationId)
    if (!target || target.kind !== 'group') {
      throw new AppError('PROVIDER_UNAVAILABLE', 'Groupe omnichat introuvable.')
    }
    const addMembers = patch.addMembers?.map((email) => email.trim().toLowerCase()).filter(Boolean)
    const removeMembers = patch.removeMembers?.map((email) => email.trim().toLowerCase()).filter(Boolean)
    this.messageService!.applyGroupUpdate(self, target.groupId, patch.title, addMembers, removeMembers)
    this.send({
      t: 'group-update',
      groupId: target.groupId,
      title: patch.title,
      addMembers,
      removeMembers,
    })
    return { ok: true }
  }

  // Rejoint un groupe via son code (groupId). Le groupe apparait ensuite via le
  // group-invite (snapshot) renvoye par le serveur ; l'historique est rejoue.
  joinGroup(groupId: string): { ok: true } {
    this.requireSelf()
    this.send({ t: 'group-join', groupId: groupId.trim() })
    return { ok: true }
  }

  // Quitte un groupe : se retire cote serveur + supprime la conversation locale.
  leaveGroup(conversationId: string): { ok: true } {
    const self = this.requireSelf()
    const target = this.messageService!.targetForConversation(self, conversationId)
    if (!target || target.kind !== 'group') {
      throw new AppError('PROVIDER_UNAVAILABLE', 'Groupe omnichat introuvable.')
    }
    this.send({ t: 'group-update', groupId: target.groupId, removeMembers: [self.userId] })
    this.messageService!.deleteLocalConversation(conversationId)
    return { ok: true }
  }

  // Identifiant du pair d'un DM (reconstruit depuis l'external id, robuste meme si la
  // conversation n'a pas de participants enregistres). null si ce n'est pas un DM.
  dmPeerId(conversationId: string): string | null {
    const self = this.currentSelf()
    if (!self || !this.messageService) {
      return null
    }
    const target = this.messageService.targetForConversation(self, conversationId)
    return target && target.kind === 'dm' ? target.userId : null
  }

  // --- Appels ad-hoc (signalisation ; le media passe par LiveKit/useOmnichat) -----
  // Invite (ou ajoute) un pair a un appel : ring DIRECT vers son identifiant, avec la
  // salle ad-hoc de l'appel (omnichat:call:<uuid>). Le serveur (autorite) n'autorisera
  // le jeton LiveKit qu'aux invites/hote de CET appel.
  inviteToCall(userId: string, callId: string, room: string, media: 'audio' | 'video'): void {
    this.requireSelf()
    this.send({ t: 'call-invite', to: { kind: 'dm', userId: userId.trim() }, callId, room, media })
  }

  // Reaction (emoji) sur un message : relayee au pair/groupe (best-effort, silencieux hors-ligne).
  sendReaction(
    externalConversationId: string,
    serverMsgId: string,
    name: string,
    op: 'add' | 'remove',
  ): void {
    const self = this.currentSelf()
    if (!this.ready || !self || !this.messageService) {
      return
    }
    const target = this.messageService.targetFromExternal(self, externalConversationId)
    if (target) {
      this.send({ t: 'reaction', to: target, serverMsgId, name, op })
    }
  }

  // Declare/retire l'appel courant comme "appel du groupe" : les membres voient un bouton
  // Rejoindre (notification passive, pas de sonnerie). No-op hors d'une conversation de groupe.
  setGroupCall(conversationId: string, callId: string, room: string, active: boolean): void {
    const self = this.currentSelf()
    if (!this.ready || !self || !this.messageService) {
      return
    }
    const target = this.messageService.targetForConversation(self, conversationId)
    if (target && target.kind === 'group') {
      this.send({ t: 'call-group', groupId: target.groupId, callId, room, active })
    }
  }

  // accept/decline/cancel ciblent la contrepartie (le `from` du ring) par son identifiant,
  // sans dependre d'une conversation : un appel n'est plus rattache a une conversation.
  callAccept(counterpartId: string, callId: string): void {
    this.sendCallControlTo(counterpartId, { t: 'call-accept', callId })
  }

  callDecline(
    counterpartId: string,
    callId: string,
    reason?: 'busy' | 'declined' | 'timeout' | 'unavailable',
  ): void {
    this.sendCallControlTo(counterpartId, { t: 'call-decline', callId, reason })
  }

  callCancel(counterpartId: string, callId: string): void {
    this.sendCallControlTo(counterpartId, { t: 'call-cancel', callId })
  }

  private sendCallControlTo(
    userId: string,
    partial:
      | { t: 'call-accept'; callId: string }
      | { t: 'call-decline'; callId: string; reason?: 'busy' | 'declined' | 'timeout' | 'unavailable' }
      | { t: 'call-cancel'; callId: string },
  ): void {
    if (!this.ready) {
      return
    }
    this.send({ ...partial, to: { kind: 'dm', userId: userId.trim() } })
  }

  // Contexte "self" des qu'une identite est resolue (meme hors-ligne).
  private identitySelf(): OmnichatSelfContext {
    if (!this.identity || !this.messageService) {
      throw new AppError('PROVIDER_UNAVAILABLE', 'Aucune identite omnichat (choisissez un pseudo).')
    }
    return {
      userId: this.identity.id,
      displayName: this.identity.pseudo,
      accountId: this.identity.accountId,
    }
  }

  // Contexte "self" + connexion active (requis pour envoyer).
  private requireSelf(): OmnichatSelfContext {
    if (!this.ready) {
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        "La messagerie omnichat est hors-ligne (OmniProxy injoignable ou identite absente).",
      )
    }
    return this.identitySelf()
  }

  private displayNameFor(id: string): string | undefined {
    const key = id.toLowerCase()
    return this.contacts.get(key)?.pseudo ?? this.knownPseudos.get(key)
  }

  // --- Connexion WS -------------------------------------------------------
  private connect(): void {
    if (!appConfig.OMNIDESK_PROXY_URL || !this.identity) {
      return
    }
    // Mode comptes : sans session verifiee, pas de connexion (le serveur refuse un hello
    // non verifie). Le renderer affiche le gate (connexion) ou l'ecran de verification.
    if (!accountAuthService.isVerified()) {
      this.emitConnection(false)
      return
    }
    const base = appConfig.OMNIDESK_PROXY_URL.replace(/\/+$/, '')
    // http -> ws, https -> wss
    const wsUrl = `${base.replace(/^http/, 'ws')}/omnichat/ws`

    // Plus d'en-tete d'auth a la connexion (l'ancienne cle HMAC a disparu) : l'identite
    // est prouvee par le JWT d'acces place dans le champ `auth` du hello (cf. sendHello).
    const socket = new WebSocket(wsUrl)
    this.socket = socket

    socket.on('open', () => {
      void this.sendHello()
    })
    socket.on('message', (data: RawData, isBinary: boolean) => this.onMessage(data, isBinary))
    socket.on('close', () => this.onClose())
    socket.on('error', (error: Error) => {
      logger.warn('omnichat: erreur socket', { error: error.message })
    })
  }

  // hello : userId = email, displayName = nom du compte, auth = JWT d'acces. Le serveur
  // DERIVE l'identite du jeton et ignore userId/displayName (envoyes pour le protocole).
  // Le jeton est rafraichi juste avant l'envoi pour etre valide a l'etablissement.
  private async sendHello(): Promise<void> {
    if (!this.identity) {
      return
    }
    let token: string | null = null
    try {
      token = await accountAuthService.ensureFreshAccessToken()
    } catch {
      token = null
    }
    if (!token) {
      // Session morte pendant l'ouverture : on coupe (le gate de connexion prend le relais).
      logger.warn("omnichat: aucun jeton d'acces pour le hello, deconnexion")
      this.stop()
      return
    }
    this.send({
      t: 'hello',
      userId: this.identity.id,
      displayName: this.identity.pseudo,
      protocol: OMNICHAT_PROTOCOL_VERSION,
      auth: token,
    })
  }

  // Jeton refuse par le serveur (hello AUTH_INVALID) : on tente UN refresh puis on
  // reconnecte. On stoppe d'abord pour ne pas boucler en reconnexion avec un jeton deja
  // rejete. Si le refresh echoue (session morte ou reseau), on reste hors-ligne.
  private async handleAuthInvalid(): Promise<void> {
    this.stop()
    try {
      await accountAuthService.refreshNow()
    } catch {
      return
    }
    this.start()
  }

  private onClose(): void {
    this.ready = false
    this.clearTimers()
    this.socket = undefined
    this.emitConnection(false)
    if (this.stopped) {
      return
    }
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.reconnectAttempt)
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => this.connect(), delay)
  }

  private onMessage(data: RawData, isBinary: boolean): void {
    // Les frames binaires (pieces jointes chunkees) seront gerees plus tard.
    if (isBinary) {
      return
    }
    // Toute trame entrante = preuve de vie : on annule le timeout de pong.
    this.clearPongTimer()

    let payload: unknown
    try {
      payload = JSON.parse(this.decode(data))
    } catch {
      logger.warn('omnichat: trame JSON invalide ignoree')
      return
    }

    const parsed = serverEnvelopeSchema.safeParse(payload)
    if (!parsed.success) {
      logger.warn('omnichat: enveloppe serveur invalide ignoree')
      return
    }
    this.dispatch(parsed.data)
  }

  private dispatch(env: ServerEnvelope): void {
    switch (env.t) {
      case 'welcome':
        this.ready = true
        this.reconnectAttempt = 0
        this.startHeartbeat()
        this.emitConnection(true)
        // Modele contacts : l'annuaire global n'arrive plus. On declare nos contacts pour
        // recevoir leur presence (snapshot 'directory' puis 'presence' au fil de l'eau).
        this.sendWatch()
        this.emitPresence()
        return
      case 'directory':
        this.applyDirectory(env.roster)
        this.emitPresence()
        return
      case 'presence': {
        const key = env.userId.toLowerCase()
        // On ne traite que les identifiants qu'on surveille (contacts ∪ groupe ouvert).
        if (!this.watchedIds.has(key)) {
          return
        }
        if (env.displayName) {
          this.knownPseudos.set(key, env.displayName)
        }
        if (env.online) {
          this.onlineIds.add(key)
        } else {
          this.onlineIds.delete(key)
        }
        this.emitPresence()
        return
      }
      case 'msg-in':
        this.handleIncoming(env)
        return
      case 'msg-ack':
        if (this.messageService && this.identity) {
          this.messageService.reconcileAck(
            {
              userId: this.identity.id,
              displayName: this.identity.pseudo,
              accountId: this.identity.accountId,
            },
            env.clientMsgId,
            env.serverMsgId,
            env.serverTs,
          )
        }
        return
      case 'pong':
        return
      case 'group-invite': {
        const self = this.currentSelf()
        if (self && this.messageService) {
          const { conversationId } = this.messageService.applyGroupInvite(
            self,
            env.groupId,
            env.title,
            env.members,
          )
          eventBus.emit('omnichat:group', { conversationId })
          // Les membres du groupe peuvent avoir change -> re-surveiller si ce groupe est ouvert.
          this.refreshActiveGroup()
        }
        return
      }
      case 'group-update-in': {
        const self = this.currentSelf()
        if (self && this.messageService) {
          const removedMe = env.removeMembers?.some(
            (member) => member.toLowerCase() === self.userId.toLowerCase(),
          )
          if (removedMe) {
            // J'ai ete retire du groupe : suppression de la conversation locale.
            const conversationId = this.messageService.localConversationId(self, self.userId, {
              kind: 'group',
              groupId: env.groupId,
            })
            if (conversationId) {
              this.messageService.deleteLocalConversation(conversationId)
              eventBus.emit('omnichat:group', { conversationId })
            }
          } else {
            const updated = this.messageService.applyGroupUpdate(
              self,
              env.groupId,
              env.title,
              env.addMembers,
              env.removeMembers,
            )
            if (updated) {
              eventBus.emit('omnichat:group', { conversationId: updated.conversationId })
            }
          }
          // Membres possiblement modifies -> re-surveiller si ce groupe est ouvert.
          this.refreshActiveGroup()
        }
        return
      }
      case 'typing-in': {
        const self = this.currentSelf()
        if (self && this.messageService) {
          const conversationId = this.messageService.localConversationId(self, env.from, env.to)
          if (conversationId) {
            eventBus.emit('omnichat:typing', { conversationId, from: env.from, state: env.state })
          }
        }
        return
      }
      case 'receipt-in': {
        const self = this.currentSelf()
        if (self && this.messageService) {
          const conversationId = this.messageService.localConversationId(self, env.from, env.to)
          if (conversationId) {
            eventBus.emit('omnichat:receipt', {
              conversationId,
              from: env.from,
              serverMsgId: env.serverMsgId,
              state: env.state,
            })
          }
        }
        return
      }
      case 'reaction-in': {
        const self = this.currentSelf()
        if (self && this.messageService) {
          const result = this.messageService.applyIncomingReaction(
            self,
            env.from,
            env.serverMsgId,
            env.name,
            env.op,
          )
          if (result) {
            eventBus.emit('omnichat:reaction', { conversationId: result.conversationId })
          }
        }
        return
      }
      case 'call-ring': {
        // Appel ad-hoc : independant des conversations. On affiche un appel entrant avec
        // le nom de l'appelant (pseudo porte par le ring, sinon contact/groupe connu, sinon id).
        eventBus.emit('omnichat:call-ring', {
          from: env.from,
          fromPseudo: env.fromPseudo ?? this.displayNameFor(env.from),
          callId: env.callId,
          room: env.room,
          media: env.media,
        })
        return
      }
      case 'call-accepted':
        eventBus.emit('omnichat:call-state', { callId: env.callId, from: env.from, state: 'accepted' })
        return
      case 'call-declined':
        eventBus.emit('omnichat:call-state', {
          callId: env.callId,
          from: env.from,
          state: 'declined',
          reason: env.reason,
        })
        return
      case 'call-canceled':
        eventBus.emit('omnichat:call-state', { callId: env.callId, from: env.from, state: 'canceled' })
        return
      case 'call-active': {
        const self = this.currentSelf()
        if (self && this.messageService) {
          const conversationId = this.messageService.localGroupConversationId(self, env.groupId)
          if (conversationId) {
            eventBus.emit('omnichat:call-active', {
              conversationId,
              callId: env.callId,
              room: env.room,
              fromPseudo: env.fromPseudo,
              active: env.active,
            })
          }
        }
        return
      }
      case 'error':
        if (env.code === 'AUTH_INVALID') {
          // Jeton refuse (expire/invalide) : tentative de refresh puis reconnexion ;
          // si le refresh echoue (refresh 401), accountAuthService purge la session et
          // le gate de connexion reprend la main.
          logger.warn('omnichat: jeton refuse par le serveur, tentative de refresh')
          void this.handleAuthInvalid()
        } else if (env.code === 'EMAIL_NOT_VERIFIED') {
          // Email non verifie : inutile de boucler. On s'arrete et on resynchronise l'etat
          // (-> 'unverified') pour que l'ecran de saisie du code prenne le relais.
          logger.warn('omnichat: email non verifie, arret de la signalisation')
          this.stop()
          void accountAuthService.refreshUser()
        } else {
          logger.warn('omnichat: erreur serveur', { code: env.code, message: env.message })
        }
        return
      default:
        return
    }
  }

  private handleIncoming(env: Extract<ServerEnvelope, { t: 'msg-in' }>): void {
    const self = this.currentSelf()
    if (!self || !this.messageService) {
      return
    }
    const senderDisplayName = this.displayNameFor(env.from)
    const result = this.messageService.applyIncoming(self, env, senderDisplayName)
    if (result) {
      eventBus.emit('omnichat:message', {
        conversationId: result.conversationId,
        message: result.message,
      })
    }
  }

  private currentSelf(): OmnichatSelfContext | null {
    if (!this.identity) {
      return null
    }
    return {
      userId: this.identity.id,
      displayName: this.identity.pseudo,
      accountId: this.identity.accountId,
    }
  }

  // Snapshot de presence (reponse au 'watch') : remplace l'ensemble des contacts en
  // ligne. Le serveur ne renvoie que des pairs en ligne ; on ignore tout identifiant
  // qui ne serait pas (ou plus) dans notre liste de contacts locale.
  private applyDirectory(peers: Peer[]): void {
    this.onlineIds.clear()
    for (const peer of peers) {
      const key = peer.userId.toLowerCase()
      if (peer.displayName) {
        this.knownPseudos.set(key, peer.displayName)
      }
      if (peer.online && this.watchedIds.has(key)) {
        this.onlineIds.add(key)
      }
    }
  }

  // --- Heartbeat ----------------------------------------------------------
  private startHeartbeat(): void {
    this.clearPingTimer()
    this.pingTimer = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WS_OPEN) {
        return
      }
      this.send({ t: 'ping' })
      this.clearPongTimer()
      this.pongTimer = setTimeout(() => {
        logger.warn('omnichat: pas de reponse au ping, reconnexion')
        try {
          this.socket?.terminate()
        } catch {
          // ignore -> onClose declenchera la reconnexion
        }
      }, PONG_TIMEOUT_MS)
    }, PING_INTERVAL_MS)
  }

  private send(envelope: ClientEnvelope): void {
    if (!this.socket || this.socket.readyState !== WS_OPEN) {
      return
    }
    try {
      this.socket.send(JSON.stringify(envelope))
    } catch (error) {
      logger.warn('omnichat: echec envoi', { error: String(error) })
    }
  }

  private emitConnection(connected: boolean): void {
    eventBus.emit('omnichat:connection', {
      connected,
      identity: this.identity ? { id: this.identity.id, pseudo: this.identity.pseudo } : null,
    })
  }

  private emitPresence(): void {
    eventBus.emit('omnichat:presence', {
      contacts: this.listContacts(),
      groupPeers: this.listGroupPeers(),
    })
  }

  // Membres du groupe ouvert qui ne sont PAS des contacts (visibilite a la demande) :
  // pseudo issu de la presence vue (sinon id), online derive de onlineIds.
  private listGroupPeers(): OmnichatContact[] {
    const peers: OmnichatContact[] = []
    for (const id of this.activeGroupMemberIds) {
      if (this.contacts.has(id)) {
        continue
      }
      peers.push({
        id,
        pseudo: this.knownPseudos.get(id) ?? id,
        online: this.onlineIds.has(id),
        addedAt: '',
      })
    }
    return peers
  }

  private decode(data: RawData): string {
    if (Array.isArray(data)) {
      return Buffer.concat(data).toString('utf8')
    }
    if (data instanceof ArrayBuffer) {
      return Buffer.from(data).toString('utf8')
    }
    return (data as Buffer).toString('utf8')
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
    if (this.watchTimer) {
      clearTimeout(this.watchTimer)
      this.watchTimer = undefined
    }
    this.clearPingTimer()
    this.clearPongTimer()
  }

  private clearPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = undefined
    }
  }

  private clearPongTimer(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer)
      this.pongTimer = undefined
    }
  }
}

export const signalingClient = new SignalingClient()

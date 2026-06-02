import { defineStore } from 'pinia'
import { useAppStore } from '@renderer/stores/appStore'
import { useOmnichat } from '@renderer/composables/useOmnichat'
import type {
  ConversationSummary,
  MessageSummary,
  OmnichatCallRingEvent,
  OmnichatContact,
  OmnichatIdentity,
} from '@shared/models'

// Disposers des abonnements aux evenements push (module-level, comme appStore).
let stopConnection: (() => void) | undefined
let stopMessage: (() => void) | undefined
let stopPresence: (() => void) | undefined
let stopGroup: (() => void) | undefined
let stopTyping: (() => void) | undefined
let stopReceipt: (() => void) | undefined
let stopCallRing: (() => void) | undefined
let stopCallState: (() => void) | undefined

// Timers (module-level) : expiration d'un indicateur "ecrit..." entrant, et
// arret differe de notre propre saisie (debounce).
const incomingTypingTimers: Record<string, ReturnType<typeof setTimeout>> = {}
const outgoingTypingStopTimers: Record<string, ReturnType<typeof setTimeout>> = {}
const TYPING_IDLE_MS = 3000

// Libelle affiche a l'appelant quand un invite ne rejoint pas l'appel (refus, injoignable,
// annulation). "decroche" = a rejoint l'appel ; sinon on explique pourquoi ca a echoue.
const callEndReason = (
  state: 'accepted' | 'declined' | 'canceled',
  reason?: 'busy' | 'declined' | 'timeout' | 'unavailable',
): string => {
  if (state === 'canceled') {
    return "a annule l'appel"
  }
  switch (reason) {
    case 'busy':
      return 'est deja en appel'
    case 'unavailable':
      return "n'a pas pu etre joint"
    case 'timeout':
      return "n'a pas repondu"
    default:
      return "n'a pas decroche"
  }
}

interface OmnichatStoreState {
  identity: OmnichatIdentity | null
  connected: boolean
  contacts: OmnichatContact[]
  // Membres du groupe ouvert hors contacts (visibilite a la demande), avec presence.
  groupPeers: OmnichatContact[]
  conversations: ConversationSummary[]
  // convId -> nom affiche du pair en train d'ecrire (vide = personne).
  typingByConversation: Record<string, string>
  // convId -> true quand le pair a lu nos messages (affiche "Lu").
  readByConversation: Record<string, boolean>
  // Appel entrant en attente de reponse (cote destinataire), sinon null.
  incomingCall: OmnichatCallRingEvent | null
  initialized: boolean
  working: boolean
  error?: string
}

const api = () => window.omnidesk

export const useOmnichatStore = defineStore('omnichat', {
  state: (): OmnichatStoreState => ({
    identity: null,
    connected: false,
    contacts: [],
    groupPeers: [],
    conversations: [],
    typingByConversation: {},
    readByConversation: {},
    incomingCall: null,
    initialized: false,
    working: false,
  }),

  getters: {
    dms: (state): ConversationSummary[] => state.conversations.filter((c) => c.kind === 'dm'),
    groups: (state): ConversationSummary[] => state.conversations.filter((c) => c.kind === 'group'),
    // Contacts en ligne (hors soi-meme), pour un eventuel raccourci.
    onlineContacts: (state): OmnichatContact[] => {
      const self = state.identity?.id?.toLowerCase()
      return state.contacts.filter((contact) => contact.online && contact.id.toLowerCase() !== self)
    },
    // Index id -> pair (contacts ∪ membres du groupe ouvert), pour resoudre nom/presence
    // (roster de groupe, nom d'appelant, picker d'ajout a l'appel).
    peersById: (state): Record<string, OmnichatContact> => {
      const map: Record<string, OmnichatContact> = {}
      for (const peer of [...state.contacts, ...state.groupPeers]) {
        map[peer.id.toLowerCase()] = peer
      }
      return map
    },
    hasIdentity: (state): boolean => state.identity !== null,
  },

  actions: {
    async init(): Promise<void> {
      if (this.initialized) {
        return
      }
      const a = api()
      if (!a?.omnichat?.getIdentity) {
        return
      }
      this.initialized = true
      try {
        const state = await a.omnichat.getIdentity()
        this.identity = state.identity
        this.connected = state.connected
      } catch {
        // Pas critique : la vue affichera l'etat hors-ligne.
      }
      await this.refreshConversations()
      try {
        this.contacts = await a.omnichat.listContacts()
      } catch {
        // ignore
      }
      this.subscribe()
    },

    subscribe(): void {
      const a = api()
      if (!a?.events) {
        return
      }
      stopConnection?.()
      stopMessage?.()
      stopPresence?.()
      stopGroup?.()
      stopTyping?.()
      stopReceipt?.()
      stopCallRing?.()
      stopCallState?.()
      stopConnection = a.events.onOmnichatConnection((event) => {
        this.connected = event.connected
        if (event.identity) {
          this.identity = event.identity
        }
      })
      stopPresence = a.events.onOmnichatPresence((event) => {
        this.contacts = event.contacts
        this.groupPeers = event.groupPeers
      })
      stopMessage = a.events.onOmnichatMessage((event) => {
        this.handleIncoming(event.conversationId, event.message)
      })
      stopGroup = a.events.onOmnichatGroup((event) => {
        void this.handleGroupChange(event.conversationId)
      })
      stopTyping = a.events.onOmnichatTyping((event) => {
        this.handleTyping(event.conversationId, event.from, event.state)
      })
      stopReceipt = a.events.onOmnichatReceipt((event) => {
        if (event.state === 'read') {
          this.readByConversation = { ...this.readByConversation, [event.conversationId]: true }
        }
      })
      stopCallRing = a.events.onOmnichatCallRing((event) => {
        // La sonnerie entrante (PJ1) est pilotee par IncomingCallDialog, qui suit
        // l'etat incomingCall : on se contente donc de le poser ici.
        this.incomingCall = event
      })
      stopCallState = a.events.onOmnichatCallState((event) => {
        // Cote destinataire : un appel entrant refuse/annule par l'autre retire la bulle
        // (et coupe la sonnerie, IncomingCallDialog suivant l'etat incomingCall).
        if (this.incomingCall?.callId === event.callId && event.state !== 'accepted') {
          this.incomingCall = null
        }
        // Cote appelant/hote : un invite a refuse, est injoignable ou a annule. On le
        // retire des invitations en attente et on affiche un message. Si on se retrouve
        // SEUL (plus aucun invite en attente ni participant present), on raccroche aussi
        // (1-a-1 : decline -> les deux raccrochent ; multipartite : on reste tant qu'il y
        // a du monde / des invites en attente).
        const call = useOmnichat()
        if (call.state.callId === event.callId && event.state !== 'accepted') {
          call.handleInviteResolved(event.from)
          const name = this.peersById[event.from.toLowerCase()]?.pseudo ?? event.from
          useAppStore().actionFeedback = `L'utilisateur ${name} ${callEndReason(event.state, event.reason)}`
          const remotePresent = call.state.roster.some((entry) => !entry.isLocal)
          if (call.state.pendingInvites.length === 0 && !remotePresent) {
            void call.leave()
          }
        }
      })
    },

    // --- Appels ad-hoc ---------------------------------------------------
    // Demarre un appel pour une conversation : DM -> on invite le pair ; groupe -> on
    // demarre seul (on ajoute ensuite via le bouton + de l'appel, jamais tout le groupe).
    async startCallForConversation(conv: { id: string; kind?: string; title: string }): Promise<void> {
      const a = api()
      if (!a?.omnichat) {
        return
      }
      let inviteUserIds: string[] = []
      if (conv.kind !== 'group') {
        const peer = await a.omnichat.dmPeer(conv.id)
        if (peer.userId) {
          inviteUserIds = [peer.userId]
        }
      }
      await useOmnichat().startCall({ media: 'audio', inviteUserIds, title: conv.title })
    },

    async acceptIncomingCall(): Promise<void> {
      const call = this.incomingCall
      if (!call) {
        return
      }
      this.incomingCall = null
      await useOmnichat().acceptCall({
        callId: call.callId,
        room: call.room,
        title: call.fromPseudo ?? call.from,
      })
      // Previent l'appelant qu'on a accepte (best-effort).
      await api()?.omnichat?.callAccept(call.from, call.callId)
    },

    async declineIncomingCall(): Promise<void> {
      const call = this.incomingCall
      if (!call) {
        return
      }
      this.incomingCall = null
      await api()?.omnichat?.callDecline({ from: call.from, callId: call.callId, reason: 'declined' })
    },

    // Signale au main le groupe ouvert (presence a la demande de ses membres). null sinon.
    watchGroup(conversationId: string | null): void {
      void api()?.omnichat?.watchGroup(conversationId)
    },

    handleTyping(conversationId: string, from: string, state: 'start' | 'stop'): void {
      const existing = incomingTypingTimers[conversationId]
      if (existing) {
        clearTimeout(existing)
        delete incomingTypingTimers[conversationId]
      }
      if (state === 'stop') {
        const next = { ...this.typingByConversation }
        delete next[conversationId]
        this.typingByConversation = next
        return
      }
      const peer = this.contacts.find((contact) => contact.id.toLowerCase() === from.toLowerCase())
      this.typingByConversation = {
        ...this.typingByConversation,
        [conversationId]: peer?.pseudo || from,
      }
      // Auto-expiration si aucun "stop" ne suit.
      incomingTypingTimers[conversationId] = setTimeout(() => {
        const next = { ...this.typingByConversation }
        delete next[conversationId]
        this.typingByConversation = next
        delete incomingTypingTimers[conversationId]
      }, TYPING_IDLE_MS + 2000)
    },

    async handleGroupChange(conversationId: string): Promise<void> {
      await this.refreshConversations()
      // Si le groupe modifie est ouvert, on recharge son detail (membres/titre).
      const appStore = useAppStore()
      if (appStore.selectedConversation?.id === conversationId) {
        await appStore.selectConversation(conversationId)
      }
    },

    handleIncoming(conversationId: string, message: MessageSummary): void {
      // Un vrai message met fin a l'indicateur "ecrit..." de cette conversation.
      if (this.typingByConversation[conversationId]) {
        const next = { ...this.typingByConversation }
        delete next[conversationId]
        this.typingByConversation = next
      }
      // Si la conversation est ouverte, on ajoute le message en direct + on
      // marque comme lu (l'utilisateur la regarde).
      const appStore = useAppStore()
      const open = appStore.selectedConversation
      if (open && open.id === conversationId) {
        const exists = open.messages.some(
          (m) =>
            m.id === message.id
            || (Boolean(message.externalMessageId) && m.externalMessageId === message.externalMessageId),
        )
        if (!exists) {
          open.messages.push(message)
        }
        if (message.direction === 'incoming') {
          void this.markConversationRead(conversationId)
        }
      }
      void this.refreshConversations()
    },

    // Saisie en cours : envoie 'start' (puis 'stop' apres un temps d'inactivite).
    notifyTyping(conversationId: string): void {
      const a = api()
      if (!a?.omnichat?.typing) {
        return
      }
      if (outgoingTypingStopTimers[conversationId]) {
        clearTimeout(outgoingTypingStopTimers[conversationId])
      } else {
        void a.omnichat.typing(conversationId, 'start')
      }
      outgoingTypingStopTimers[conversationId] = setTimeout(() => {
        delete outgoingTypingStopTimers[conversationId]
        void a.omnichat?.typing(conversationId, 'stop')
      }, TYPING_IDLE_MS)
    },

    stopTypingNow(conversationId: string): void {
      const timer = outgoingTypingStopTimers[conversationId]
      if (timer) {
        clearTimeout(timer)
        delete outgoingTypingStopTimers[conversationId]
        void api()?.omnichat?.typing(conversationId, 'stop')
      }
    },

    // Marque la conversation ouverte comme lue (accuse sur le dernier message recu).
    markConversationRead(conversationId: string): void {
      const a = api()
      if (!a?.omnichat?.sendReceipt) {
        return
      }
      const conv = useAppStore().selectedConversation
      if (!conv || conv.id !== conversationId) {
        return
      }
      const lastIncoming = [...conv.messages]
        .reverse()
        .find((m) => m.direction === 'incoming' && Boolean(m.externalMessageId))
      if (lastIncoming) {
        void a.omnichat.sendReceipt(conversationId, lastIncoming.externalMessageId, 'read')
      }
    },

    // A l'envoi d'un message, le pair n'a pas encore lu : on retire le "Lu".
    markOutgoingSent(conversationId: string): void {
      if (this.readByConversation[conversationId]) {
        const next = { ...this.readByConversation }
        delete next[conversationId]
        this.readByConversation = next
      }
    },

    async refreshConversations(): Promise<void> {
      const a = api()
      if (!a?.conversations?.list) {
        return
      }
      const all = await a.conversations.list()
      this.conversations = all
        .filter((conversation) => conversation.providerId === 'omnichat')
        .sort((left, right) => (right.lastMessageAt ?? '').localeCompare(left.lastMessageAt ?? ''))
    },

    // --- Contacts --------------------------------------------------------
    async loadContacts(): Promise<void> {
      const a = api()
      if (!a?.omnichat?.listContacts) {
        return
      }
      try {
        this.contacts = await a.omnichat.listContacts()
      } catch {
        // ignore
      }
    },

    // Ajoute un contact par pseudo + identifiant (le "hash"). N'ouvre PAS de DM : le
    // contact apparait dans la liste, d'ou l'on pourra ensuite demarrer un DM ou un appel.
    async addContact(pseudo: string, id: string): Promise<void> {
      const a = api()
      if (!a?.omnichat?.addContact) {
        return
      }
      this.working = true
      this.error = undefined
      try {
        await a.omnichat.addContact(pseudo, id)
        await this.loadContacts()
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Impossible d'ajouter le contact."
        throw error
      } finally {
        this.working = false
      }
    },

    async removeContact(id: string): Promise<void> {
      const a = api()
      if (!a?.omnichat?.removeContact) {
        return
      }
      try {
        await a.omnichat.removeContact(id)
        await this.loadContacts()
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Impossible de retirer le contact.'
      }
    },

    // Ouvre (ou cree) un DM avec un pair (identifiant) puis le selectionne.
    async openDm(peerId: string): Promise<void> {
      const a = api()
      if (!a?.omnichat?.openDm) {
        return
      }
      this.working = true
      this.error = undefined
      try {
        const { conversationId } = await a.omnichat.openDm(peerId)
        await this.refreshConversations()
        await useAppStore().selectConversation(conversationId)
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Impossible d'ouvrir le message direct."
      } finally {
        this.working = false
      }
    },

    async openConversation(conversationId: string): Promise<void> {
      await useAppStore().selectConversation(conversationId)
      this.markConversationRead(conversationId)
      // selectConversation a remis les messages a "lu" cote DB : on recharge la liste
      // omnichat pour que la pastille de la conversation disparaisse aussi (la sidebar
      // de gauche est deja mise a jour de maniere optimiste cote appStore).
      await this.refreshConversations()
    },

    // Cree un groupe (titre + membres par email) puis l'ouvre.
    async createGroup(title: string, members: string[]): Promise<void> {
      const a = api()
      if (!a?.omnichat?.createGroup) {
        return
      }
      this.working = true
      this.error = undefined
      try {
        const { conversationId } = await a.omnichat.createGroup(title, members)
        await this.refreshConversations()
        await useAppStore().selectConversation(conversationId)
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Impossible de creer le groupe.'
        throw error
      } finally {
        this.working = false
      }
    },

    async updateGroup(input: {
      conversationId: string
      title?: string
      addMembers?: string[]
      removeMembers?: string[]
    }): Promise<void> {
      const a = api()
      if (!a?.omnichat?.updateGroup) {
        return
      }
      this.working = true
      this.error = undefined
      try {
        await a.omnichat.updateGroup(input)
        await this.handleGroupChange(input.conversationId)
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Impossible de mettre a jour le groupe.'
        throw error
      } finally {
        this.working = false
      }
    },

    // Rejoint un groupe via son code (groupId). Le groupe apparait via l'evenement
    // group-invite (snapshot) -> handleGroupChange rafraichit la liste.
    async joinGroup(groupId: string): Promise<void> {
      const a = api()
      if (!a?.omnichat?.joinGroup) {
        return
      }
      this.working = true
      this.error = undefined
      try {
        await a.omnichat.joinGroup(groupId)
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Impossible de rejoindre le groupe.'
        throw error
      } finally {
        this.working = false
      }
    },

    // Quitte un groupe : retire cote serveur, supprime localement, ferme la vue.
    async leaveGroup(conversationId: string): Promise<void> {
      const a = api()
      if (!a?.omnichat?.leaveGroup) {
        return
      }
      this.working = true
      this.error = undefined
      try {
        await a.omnichat.leaveGroup(conversationId)
        const appStore = useAppStore()
        if (appStore.selectedConversation?.id === conversationId) {
          appStore.selectedConversation = undefined
        }
        await this.refreshConversations()
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Impossible de quitter le groupe.'
        throw error
      } finally {
        this.working = false
      }
    },

    // Recupere le code d'un groupe et le copie (a partager pour inviter). Renvoie
    // true si copie.
    async copyGroupCode(conversationId: string): Promise<boolean> {
      const a = api()
      if (!a?.omnichat?.groupCode) {
        return false
      }
      try {
        const { code } = await a.omnichat.groupCode(conversationId)
        if (!code) {
          return false
        }
        await navigator.clipboard.writeText(code)
        return true
      } catch {
        return false
      }
    },

    async setIdentity(pseudo: string): Promise<void> {
      const a = api()
      if (!a?.omnichat?.setIdentity) {
        return
      }
      this.working = true
      this.error = undefined
      try {
        const state = await a.omnichat.setIdentity(pseudo)
        this.identity = state.identity
        this.connected = state.connected
        await this.refreshConversations()
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Impossible d'enregistrer le pseudo."
      } finally {
        this.working = false
      }
    },
  },
})

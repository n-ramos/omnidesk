import type { OmniBrowserShortcutAction } from './shortcuts'

export type ISODateString = string
export type UUID = string

export type ProviderKind = 'teams' | 'slack' | 'outlook' | 'imap' | 'webpage' | 'omnichat'

export type ProviderCapability =
  | 'password-auth'
  | 'sync-conversations'
  | 'sync-messages'
  | 'send-message'
  | 'attachments'
  | 'notifications'
  | 'embedded-webview'

export type MessageDirection = 'incoming' | 'outgoing'
export type MessageState = 'unread' | 'read' | 'archived' | 'snoozed' | 'pinned'
export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'
export type AccountSetupStatus = 'draft' | 'pending_setup' | 'connected' | 'error'
export type ConversationKind = 'channel' | 'dm' | 'group' | 'thread' | 'mail'

export type MessageContentToken =
  | { type: 'text'; text: string }
  | { type: 'mention-user'; userId: string; label: string }
  | { type: 'mention-keyword'; keyword: 'channel' | 'here' | 'everyone' | 'group'; label: string }
  | { type: 'channel-link'; externalConversationId: string; label: string }
  | { type: 'link'; href: string; label: string }
  | { type: 'emoji'; name: string }

export interface ProviderDescriptor {
  id: ProviderKind
  name: string
  displayName: string
  capabilities: readonly ProviderCapability[]
  authReady: boolean
}

export interface AccountSummary {
  id: UUID
  providerId: ProviderKind
  label: string
  externalAccountId: string
  emailAddress?: string
  displayName?: string
  isEnabled: boolean
  setupStatus: AccountSetupStatus
  lastSyncAt?: ISODateString
  settings?: Record<string, unknown>
}

export interface ConversationSummary {
  id: UUID
  providerId: ProviderKind
  accountId: UUID
  kind?: ConversationKind
  subject?: string
  title: string
  lastMessagePreview?: string
  lastMessageAt?: ISODateString
  lastSenderName?: string
  lastSenderAddress?: string
  lastDirection?: MessageDirection
  unreadCount: number
  isMuted: boolean
}

export interface MessageReactionSummary {
  name: string
  count: number
  mine: boolean
}

export interface AttachmentSummary {
  id: UUID
  externalAttachmentId?: string
  fileName: string
  mimeType?: string
  byteSize?: number
  downloadUrl?: string
  /** True when the attachment can be opened (local copy on disk or remote downloadUrl set). */
  canOpen?: boolean
}

export interface OutgoingAttachment {
  fileName: string
  mimeType: string
  byteSize: number
  bytesBase64: string
}

export interface MessageSummary {
  id: UUID
  providerId: ProviderKind
  conversationId: UUID
  externalMessageId: string
  direction: MessageDirection
  senderName?: string
  senderAddress?: string
  bodyPreview?: string
  bodyTokens?: MessageContentToken[]
  receivedAt?: ISODateString
  sentAt?: ISODateString
  state: MessageState
  reactions?: MessageReactionSummary[]
  attachments?: AttachmentSummary[]
}

export interface ConversationDetail extends ConversationSummary {
  messages: MessageSummary[]
  participants: Array<{
    id: UUID
    displayName?: string
    address?: string
    role?: string
  }>
}

export interface LocalNotification {
  id: UUID
  level: NotificationLevel
  title: string
  body?: string
  sourceProviderId?: ProviderKind
  accountId?: UUID
  conversationId?: UUID
  createdAt: ISODateString
  readAt?: ISODateString
}

export interface AppBootstrap {
  appVersion: string
  platform: NodeJS.Platform
  databaseReady: boolean
  providers: ProviderDescriptor[]
}

export interface CreateDraftAccountInput {
  providerId: ProviderKind
  label: string
  emailAddress?: string
  displayName?: string
  imapHost?: string
  imapPort?: number
  smtpHost?: string
  smtpPort?: number
}

export type MailSocketType = 'SSL' | 'STARTTLS' | 'plain'

export interface MailServerSettings {
  host: string
  port: number
  socketType: MailSocketType
  username: string
}

export interface MailAutodiscoverResult {
  source: 'mozilla-isp' | 'mozilla-thunderbird' | 'dns-srv' | 'dns-mx' | 'guess'
  emailProvider?: string
  displayName?: string
  documentationUrl?: string
  imap?: MailServerSettings
  smtp?: MailServerSettings
}

export interface ConnectImapAccountInput {
  label: string
  emailAddress: string
  displayName?: string
  password: string
  imap: MailServerSettings
  smtp: MailServerSettings
}

export type MailFolderRole =
  | 'inbox'
  | 'sent'
  | 'drafts'
  | 'trash'
  | 'junk'
  | 'archive'
  | 'all'
  | 'flagged'
  | 'other'

export interface MailFolderSummary {
  path: string
  name: string
  role: MailFolderRole
  delimiter?: string
  unreadCount?: number
  totalCount?: number
}

export interface ComposeMailRequest {
  accountId: UUID
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  body: string
  attachments?: OutgoingAttachment[]
}

export interface ConnectWebpageAccountInput {
  label: string
  url: string
}

export interface ConversationFilters {
  query?: string
  accountId?: UUID
  unreadOnly?: boolean
}

export interface UpdateMessageStateInput {
  messageId: UUID
  state: MessageState
  enabled: boolean
}

export interface ContactSummary {
  accountId: UUID
  externalContactId: string
  displayName: string
  email?: string
  presence?: 'active' | 'away'
}

export interface SendMessageRequest {
  conversationId: UUID
  body: string
  attachments?: OutgoingAttachment[]
}

export interface ToggleReactionRequest {
  messageId: UUID
  name: string
  enabled: boolean
}

export interface TenorGifResult {
  id: string
  title: string
  previewUrl: string
  previewWidth: number
  previewHeight: number
  fullUrl: string
  fullWidth: number
  fullHeight: number
}

export interface TenorStatus {
  ready: boolean
}

export interface LocalStatus {
  appVersion: string
  platform: NodeJS.Platform
  databasePath: string
  databaseReady: boolean
  providers: ProviderDescriptor[]
  accountsCount: number
  security: {
    contextIsolation: boolean
    nodeIntegration: boolean
    sandbox: boolean
    tokenStorage: 'safeStorage'
  }
}

export type StartupView = 'default-home' | 'custom-home' | 'inbox' | 'notifications'

export interface HomeWidgetInstance {
  id: UUID
  widgetId: string
  x: number
  y: number
  w: number
  h: number
  config?: Record<string, unknown>
}

export interface HomeLayout {
  widgets: HomeWidgetInstance[]
}

export interface WeatherSnapshot {
  locationName: string
  latitude: number
  longitude: number
  temperature: number | null
  temperatureUnit: string
  windSpeed: number | null
  windUnit: string
  humidity: number | null
  weatherCode: number | null
  isDay: boolean
  fetchedAt: ISODateString
}

export interface CitySuggestion {
  name: string
  region?: string
  country?: string
  countryCode?: string
  latitude: number
  longitude: number
}

export interface RssItem {
  title: string
  link?: string
  publishedAt?: ISODateString
  author?: string
  summary?: string
}

export interface RssFeed {
  title: string
  link?: string
  items: RssItem[]
  fetchedAt: ISODateString
}

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type ReminderRecurrence =
  | { kind: 'once'; scheduledAt: ISODateString }
  | { kind: 'daily'; timeOfDay: string }
  | { kind: 'weekly'; weekdays: Weekday[]; timeOfDay: string }
  | { kind: 'monthly'; dayOfMonth: number; timeOfDay: string }
  | { kind: 'interval'; everyMinutes: number }

export interface Reminder {
  id: UUID
  title: string
  body?: string
  recurrence: ReminderRecurrence
  nextOccurrenceAt: ISODateString
  lastFiredAt?: ISODateString
  isEnabled: boolean
  createdAt: ISODateString
  updatedAt: ISODateString
}

export interface CreateReminderInput {
  title: string
  body?: string
  recurrence: ReminderRecurrence
  isEnabled?: boolean
}

export interface UpdateReminderInput {
  id: UUID
  title?: string
  body?: string
  recurrence?: ReminderRecurrence
  isEnabled?: boolean
}

export interface BrowserSpace {
  id: UUID
  name: string
  icon?: string
  color?: string
  partitionKey: string
  adBlock: boolean
  positionIndex: number
  isActive: boolean
  createdAt: ISODateString
  updatedAt: ISODateString
}

export interface CreateBrowserSpaceInput {
  name: string
  icon?: string
  color?: string
}

export interface UpdateBrowserSpaceInput {
  id: UUID
  name?: string
  icon?: string
  color?: string
}

export interface BrowserBookmarkCategory {
  id: UUID
  spaceId: UUID
  name: string
  positionIndex: number
  createdAt: ISODateString
  updatedAt: ISODateString
}

export interface BrowserBookmark {
  id: UUID
  spaceId: UUID
  categoryId?: UUID | null
  title: string
  url: string
  faviconUrl?: string
  positionIndex: number
  createdAt: ISODateString
  updatedAt: ISODateString
}

export interface BrowserHistoryEntry {
  id: UUID
  spaceId: UUID
  url: string
  title?: string
  faviconUrl?: string
  visitCount: number
  firstVisitedAt: ISODateString
  lastVisitedAt: ISODateString
}

export interface BrowserTab {
  id: UUID
  spaceId: UUID
  groupId?: UUID | null
  url: string
  title?: string
  // Surnom defini par l'utilisateur. Prioritaire sur `title` a l'affichage ; null/absent => titre de page.
  customTitle?: string | null
  faviconUrl?: string
  positionIndex: number
  isPinned: boolean
  isActive: boolean
  lastActiveAt: ISODateString
}

export interface BrowserTabGroup {
  id: UUID
  spaceId: UUID
  name: string
  color?: string
  positionIndex: number
  isCollapsed: boolean
  createdAt: ISODateString
  updatedAt: ISODateString
}

export interface BrowserExtension {
  id: UUID
  path: string
  name: string
  version?: string
  isEnabled: boolean
  createdAt: ISODateString
  updatedAt: ISODateString
}

// Identifiant web enregistre (gestionnaire de mots de passe). Vue de gestion/liste : le mot de
// passe (chiffre au repos via safeStorage) n'est JAMAIS expose ici.
export interface BrowserCredential {
  id: UUID
  origin: string
  username: string
  createdAt: ISODateString
  updatedAt: ISODateString
}

// Vue interne transmise ponctuellement au webview pour pre-remplir un formulaire de connexion.
// Contient le mot de passe en clair : ne jamais journaliser ni persister tel quel.
export interface BrowserCredentialFill {
  username: string
  password: string
}

export interface OmniBrowserSettings {
  searchEngineId: string
  sidebarCollapsed: boolean
  // Moteur de recherche personnalise (utilise quand searchEngineId === 'custom').
  customSearchName?: string
  customSearchTemplate?: string
  // Raccourcis clavier remappes (action -> accelerateur Electron). Fusionnes
  // avec les defauts par resolveShortcuts() ; absents = valeur par defaut.
  shortcuts?: Partial<Record<OmniBrowserShortcutAction, string>>
}

export type OmniboxSuggestionKind = 'top-site' | 'bookmark' | 'history' | 'url' | 'search'

export interface OmniboxSuggestion {
  kind: OmniboxSuggestionKind
  title: string
  url: string
  faviconUrl?: string
}

// --- Omnichat (messagerie native temps reel) -----------------------------
// Cible d'un message/appel omnichat (miroir de Target cote protocole WS).
export type OmnichatTargetDto =
  | { kind: 'dm'; userId: string }
  | { kind: 'group'; groupId: string }

// Identite omnichat = compte OmniProxy connecte : `id` = email (identifiant de transport,
// en minuscules) et `pseudo` = nom affiche du compte. Le serveur la derive du JWT.
export interface OmnichatIdentity {
  id: string
  pseudo: string
}

// Etat renvoye par omnichat:get-identity.
export interface OmnichatIdentityState {
  identity: OmnichatIdentity | null
  connected: boolean
}

// Contact omnichat (modele sans annuaire global) : ajoute par l'utilisateur via son
// adresse email (= identifiant OmniChat) + un pseudo (libelle) local. `online` est une
// surcouche ephemere derivee de la presence serveur (restreinte a nos contacts).
export interface OmnichatContact {
  id: string
  pseudo: string
  online: boolean
  addedAt: string
}

// --- Evenements pousses main -> renderer (PRELOAD_EVENTS.OMNICHAT_*) -------
export interface OmnichatConnectionEvent {
  connected: boolean
  identity: OmnichatIdentity | null
}

export interface OmnichatMessageEvent {
  conversationId: UUID
  message: MessageSummary
}

// Presence poussee au renderer a chaque changement (presence ou composition). `contacts`
// = liste de contacts persistante ; `groupPeers` = membres du groupe ouvert hors contacts
// (visibilite a la demande), chacun avec son etat en ligne.
export interface OmnichatPresenceEvent {
  contacts: OmnichatContact[]
  groupPeers: OmnichatContact[]
}

// Un groupe a ete cree/rejoint/mis a jour : le renderer rafraichit sa liste.
export interface OmnichatGroupEvent {
  conversationId: UUID
}

export interface OmnichatTypingEvent {
  conversationId: UUID
  from: string
  state: 'start' | 'stop'
}

export interface OmnichatReceiptEvent {
  conversationId: UUID
  from: string
  serverMsgId: string
  state: 'delivered' | 'read'
}

export type OmnichatCallMedia = 'audio' | 'video'

// Appel ad-hoc entrant : independant des conversations. `from` = identifiant de
// l'appelant ; `fromPseudo` = son pseudo (porte par le ring) pour l'affichage ;
// `room` = salle ad-hoc a rejoindre (jeton obtenu via getCallToken).
export interface OmnichatCallRingEvent {
  from: string
  fromPseudo?: string
  callId: string
  room: string
  media: OmnichatCallMedia
}

export interface OmnichatCallStateEvent {
  conversationId?: UUID
  callId: string
  from: string
  state: 'accepted' | 'declined' | 'canceled'
  reason?: 'busy' | 'declined' | 'timeout' | 'unavailable'
}

// Une reaction (emoji) a ete appliquee/retiree sur un message d'une conversation : le
// renderer recharge la conversation ouverte pour rafraichir les reactions.
export interface OmnichatReactionEvent {
  conversationId: UUID
}

// Un appel de groupe est devenu actif (active=true) ou s'est termine (active=false) :
// le renderer affiche/retire le bouton "Rejoindre l'appel" pour ce groupe.
export interface OmnichatCallActiveEvent {
  conversationId: UUID
  callId: string
  room: string
  fromPseudo?: string
  active: boolean
}

// --- Omnipass (coffre de mots de passe zero-knowledge) --------------------
// Cycle de vie du coffre : aucun coffre cree -> verrouille -> deverrouille (cle en memoire).
export type PassVaultStatus = 'uninitialized' | 'locked' | 'unlocked'

// Etat renvoye par passvault:get-status. Ne contient JAMAIS de secret ni de cle.
export interface PassVaultState {
  status: PassVaultStatus
  autoLockMs: number
  biometricAvailable: boolean
  biometricEnabled: boolean
  recoveryEnabled: boolean
}

// Vue de liste : metadonnees + champs dechiffres pour l'affichage, SANS mot de passe ni note.
export interface PassEntrySummary {
  id: UUID
  folderId: UUID | null
  title: string
  username: string | null
  url: string | null
  icon: string | null
  favorite: boolean
  passwordUpdatedAt: ISODateString | null
  createdAt: ISODateString
  updatedAt: ISODateString
}

// Secret revele a la demande explicite (affichage oeil). Ne jamais journaliser ni persister.
export interface PassEntrySecret {
  password: string
  notes: string | null
}

export interface CreatePassEntryInput {
  title: string
  username?: string
  url?: string
  password: string
  notes?: string
  folderId?: UUID | null
  icon?: string
}

export interface UpdatePassEntryInput {
  id: UUID
  title?: string
  username?: string | null
  url?: string | null
  password?: string
  notes?: string | null
  folderId?: UUID | null
  icon?: string | null
  favorite?: boolean
}

// Options du generateur de mot de passe (genere cote main via crypto.randomInt).
export interface PassPasswordGenOptions {
  length: number
  lowercase?: boolean
  uppercase?: boolean
  digits?: boolean
  symbols?: boolean
  excludeAmbiguous?: boolean
}

// Options de generation d'une phrase secrete (passphrase) ; generee cote main via la wordlist.
export interface PassPassphraseGenOptions {
  words: number
  separator?: string
  capitalize?: boolean
  includeNumber?: boolean
}

// Dossier du coffre, recursif via parentId. Le nom est dechiffre cote main ; ids, parentId,
// icone et position restent en clair (metadonnees structurelles non sensibles).
export interface PassFolderSummary {
  id: UUID
  parentId: UUID | null
  name: string
  icon: string | null
  position: number
  createdAt: ISODateString
  updatedAt: ISODateString
}

export interface CreatePassFolderInput {
  name: string
  parentId?: UUID | null
  icon?: string
}

export interface UpdatePassFolderInput {
  id: UUID
  name?: string
  parentId?: UUID | null
  icon?: string | null
}

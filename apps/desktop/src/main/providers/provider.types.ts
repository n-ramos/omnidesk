import type {
  ConversationKind,
  MessageContentToken,
  ProviderDescriptor,
  ProviderKind,
  UUID,
} from '@shared/models'

export interface ProviderAccountProfile {
  externalAccountId: string
  label: string
  emailAddress?: string
  displayName?: string
  settings?: Record<string, unknown>
}

export interface ProviderCredentials {
  accessToken: string
  refreshToken?: string
  expiresAt?: string
}

export interface SyncCursor {
  scope: string
  value: string
}

export interface ProviderConversationParticipant {
  externalParticipantId?: string
  displayName?: string
  address?: string
  role?: string
}

export interface ProviderConversationRecord {
  externalConversationId: string
  title: string
  kind?: ConversationKind
  subject?: string
  lastMessagePreview?: string
  lastMessageAt?: string
  unreadCount: number
  isMuted: boolean
  participants?: ProviderConversationParticipant[]
}

export interface ProviderMessageReaction {
  name: string
  externalUserIds: string[]
  count: number
}

export interface ProviderMessageAttachment {
  externalAttachmentId?: string
  fileName: string
  mimeType?: string
  byteSize?: number
  downloadUrl?: string
  /** Inline binary content. When set, the repository writes it to disk and stores local_path. */
  content?: Buffer
}

export interface ProviderMessageRecord {
  externalMessageId: string
  conversationExternalId: string
  direction: 'incoming' | 'outgoing'
  senderName?: string
  senderAddress?: string
  bodyPlain?: string
  bodyHtml?: string
  bodyPreview?: string
  bodyTokens?: MessageContentToken[]
  receivedAt?: string
  sentAt?: string
  mentionsCurrentUser?: boolean
  reactions?: ProviderMessageReaction[]
  attachments?: ProviderMessageAttachment[]
  /**
   * When true the message already exists locally and only minimal envelope
   * data is provided. The repository must keep the existing conversation,
   * body, attachments, and reactions intact.
   */
  envelopeOnly?: boolean
  /** IMAP \Seen flag inverted : true if the message has not been read on the server. */
  isUnread?: boolean
  /** IMAP UID within the source folder (used to STORE flags later). */
  externalUid?: number
  /** IMAP folder path the message belongs to. */
  folderPath?: string
}

export interface ProviderSyncResult<Item> {
  items: Item[]
  cursors: SyncCursor[]
}

export interface OutgoingAttachmentInput {
  fileName: string
  mimeType: string
  byteSize: number
  bytes: Buffer
}

export interface SendMessageInput {
  accountId: UUID
  conversationId: UUID
  externalConversationId: string
  body: string
  attachments?: OutgoingAttachmentInput[]
  subject?: string
  recipients?: string[]
  inReplyTo?: string
  references?: string[]
}

export interface SendMessageResult {
  externalMessageId: string
  attachments?: ProviderMessageAttachment[]
}

export interface ToggleReactionInput {
  externalConversationId: string
  externalMessageId: string
  name: string
  enabled: boolean
}

export interface ProviderRuntimeContext {
  accountId: UUID
  providerId: ProviderKind
  externalAccountId: string
  settings: Record<string, unknown>
  credentials: ProviderCredentials
  onCredentialsRefreshed?: (credentials: ProviderCredentials) => Promise<void> | void
  isMessageKnown?: (externalMessageId: string) => boolean
}

export interface ProviderContactRecord {
  externalContactId: string
  displayName: string
  email?: string
  presence?: 'active' | 'away'
}

export interface ProviderOpenDirectResult {
  externalConversationId: string
  title: string
}

export interface CommunicationProvider {
  readonly descriptor: ProviderDescriptor
  syncConversations(
    context: ProviderRuntimeContext,
  ): Promise<ProviderSyncResult<ProviderConversationRecord>>
  syncMessages(context: ProviderRuntimeContext): Promise<ProviderSyncResult<ProviderMessageRecord>>
  syncFocusedConversation?(
    context: ProviderRuntimeContext,
    externalConversationId: string,
  ): Promise<ProviderSyncResult<ProviderMessageRecord>>
  listContacts?(context: ProviderRuntimeContext): Promise<ProviderContactRecord[]>
  openDirectConversation?(
    context: ProviderRuntimeContext,
    contactExternalId: string,
  ): Promise<ProviderOpenDirectResult>
  sendMessage(
    context: ProviderRuntimeContext,
    input: SendMessageInput,
  ): Promise<SendMessageResult>
  toggleReaction?(
    context: ProviderRuntimeContext,
    input: ToggleReactionInput,
  ): Promise<void>
}

export type ProviderFactory = () => CommunicationProvider

export interface ProviderRegistryEntry {
  id: ProviderKind
  create: ProviderFactory
}

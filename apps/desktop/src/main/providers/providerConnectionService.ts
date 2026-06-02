import type { Database } from 'better-sqlite3'
import { session } from 'electron'
import { AppError } from '@shared/errors'
import type {
  AccountSummary,
  ConnectImapAccountInput,
  ConnectWebpageAccountInput,
  ContactSummary,
  LocalNotification,
  UUID,
} from '@shared/models'
import { AccountRepository } from '@main/database/repositories/accountRepository'
import { ConversationRepository } from '@main/database/repositories/conversationRepository'
import { MessageRepository } from '@main/database/repositories/messageRepository'
import { NotificationRepository } from '@main/database/repositories/notificationRepository'
import { tokenVault } from '@main/security/tokenVault'
import { eventBus } from '@main/events/eventBus'
import { logger } from '@main/logger'
import { ImapProvider } from './imapProvider'
import { providerRegistry } from './providerRegistry'
import { ProviderSyncService } from './providerSyncService'
import { webpageFilterService } from './webpageFilterService'

const webpagePartition = (accountId: UUID): string => `persist:webpage-${accountId}`

export class ProviderConnectionService {
  private readonly accounts: AccountRepository
  private readonly conversations: ConversationRepository
  private readonly messages: MessageRepository
  private readonly notifications: NotificationRepository
  private readonly syncService: ProviderSyncService

  constructor(db: Database) {
    this.accounts = new AccountRepository(db)
    this.conversations = new ConversationRepository(db)
    this.messages = new MessageRepository(db)
    this.notifications = new NotificationRepository(db)
    this.syncService = new ProviderSyncService(db)
    this.hydrateWebpageFilters()
  }

  private hydrateWebpageFilters(): void {
    for (const account of this.accounts.list()) {
      if (account.providerId !== 'webpage') {
        continue
      }
      const settings = account.settings as { adBlock?: boolean } | undefined
      webpageFilterService.setFlags(webpagePartition(account.id), {
        adBlock: settings?.adBlock === true,
      })
    }
  }

  async testImapCredentials(input: {
    password: string
    imap: ConnectImapAccountInput['imap']
    smtp: ConnectImapAccountInput['smtp']
  }): Promise<void> {
    const provider = providerRegistry.get('imap')
    if (!(provider instanceof ImapProvider)) {
      throw new AppError('PROVIDER_UNAVAILABLE', "Le service IMAP n'est pas disponible.")
    }
    await provider.verifyCredentials({ imap: input.imap, smtp: input.smtp }, input.password)
  }

  async listImapFolders(accountId: UUID) {
    const { provider, context } = await this.resolveProviderContext(accountId)
    if (!(provider instanceof ImapProvider)) {
      throw new AppError('PROVIDER_UNAVAILABLE', "Ce compte n'est pas un compte IMAP.")
    }
    return provider.listFolders(context)
  }

  async selectImapFolder(accountId: UUID, folderPath: string): Promise<void> {
    const account = this.accounts.get(accountId)
    if (!account || account.providerId !== 'imap') {
      throw new AppError('PROVIDER_UNAVAILABLE', "Ce compte n'est pas un compte IMAP.")
    }
    if (account.settings.selectedFolder === folderPath) {
      return
    }
    this.accounts.updateSettings(accountId, {
      ...account.settings,
      selectedFolder: folderPath,
    })
    await this.syncService.syncAccount(accountId)
  }

  async markImapConversationRead(conversationId: UUID, read: boolean): Promise<void> {
    const ref = this.conversations.getProviderRef(conversationId)
    if (!ref || ref.providerId !== 'imap') {
      return
    }

    const unread = this.messages.findUnreadImapMessages(conversationId)
    if (unread.length === 0 && read) {
      return
    }

    const { provider, context } = await this.resolveProviderContext(ref.accountId)
    if (!(provider instanceof ImapProvider)) {
      return
    }

    const byFolder = new Map<string, number[]>()
    for (const entry of unread) {
      const bucket = byFolder.get(entry.folderPath) ?? []
      bucket.push(entry.externalUid)
      byFolder.set(entry.folderPath, bucket)
    }

    for (const [folderPath, uids] of byFolder) {
      try {
        await provider.markMessagesRead(context, folderPath, uids, read)
      } catch (error) {
        logger.warn?.('IMAP mark read failed', { folderPath, uids, error })
      }
    }

    this.messages.markConversationRead(conversationId, read)
  }

  async deleteImapConversation(conversationId: UUID): Promise<void> {
    const ref = this.conversations.getProviderRef(conversationId)
    if (!ref || ref.providerId !== 'imap') {
      throw new AppError('PROVIDER_UNAVAILABLE', "Ce fil n'est pas IMAP.")
    }

    const { provider, context } = await this.resolveProviderContext(ref.accountId)
    if (!(provider instanceof ImapProvider)) {
      throw new AppError('PROVIDER_UNAVAILABLE', "Ce compte n'est pas un compte IMAP.")
    }

    const messagesByFolder = this.messages.findImapMessagesByFolder(conversationId)
    if (messagesByFolder.size === 0) {
      this.conversations.deleteById(conversationId)
      return
    }

    const folders = await provider.listFolders(context)
    const trashFolder = folders.find((entry) => entry.role === 'trash')
    const sourcePath = typeof context.settings.selectedFolder === 'string'
      ? (context.settings.selectedFolder as string)
      : 'INBOX'
    const inTrash = trashFolder?.path === sourcePath

    for (const [folderPath, uids] of messagesByFolder) {
      if (inTrash || !trashFolder || folderPath === trashFolder.path) {
        await provider.deleteMessages(context, folderPath, uids)
      } else {
        await provider.moveMessages(context, folderPath, trashFolder.path, uids)
      }
    }

    this.conversations.deleteById(conversationId)
  }

  async moveImapConversation(
    conversationId: UUID,
    destFolderPath: string,
  ): Promise<void> {
    const ref = this.conversations.getProviderRef(conversationId)
    if (!ref || ref.providerId !== 'imap') {
      throw new AppError('PROVIDER_UNAVAILABLE', "Ce fil n'est pas IMAP.")
    }

    const { provider, context } = await this.resolveProviderContext(ref.accountId)
    if (!(provider instanceof ImapProvider)) {
      throw new AppError('PROVIDER_UNAVAILABLE', "Ce compte n'est pas un compte IMAP.")
    }

    const messagesByFolder = this.messages.findImapMessagesByFolder(conversationId)
    for (const [folderPath, uids] of messagesByFolder) {
      if (folderPath === destFolderPath) continue
      await provider.moveMessages(context, folderPath, destFolderPath, uids)
    }

    this.conversations.deleteById(conversationId)
  }

  async loadMoreImap(
    accountId: UUID,
  ): Promise<{ inserted: number }> {
    const account = this.accounts.get(accountId)
    if (!account || account.providerId !== 'imap') {
      throw new AppError('PROVIDER_UNAVAILABLE', "Ce compte n'est pas un compte IMAP.")
    }

    const folderPath = typeof account.settings.selectedFolder === 'string'
      ? (account.settings.selectedFolder as string)
      : 'INBOX'

    const oldestUid = this.messages.findOldestImapUid(accountId, folderPath)
    const { provider, context } = await this.resolveProviderContext(accountId)
    if (!(provider instanceof ImapProvider)) {
      throw new AppError('PROVIDER_UNAVAILABLE', "Ce compte n'est pas un compte IMAP.")
    }

    const older = await provider.loadOlderMessages(context, folderPath, oldestUid, 30)
    if (older.length === 0) {
      return { inserted: 0 }
    }

    const conversationIdsByExternalId = this.conversations.upsertForAccount(
      accountId,
      'imap',
      older.map((message) => ({
        externalConversationId: message.conversationExternalId,
        title: message.bodyPreview ?? '(sans objet)',
        kind: 'mail' as const,
        lastMessageAt: message.sentAt ?? message.receivedAt,
        lastMessagePreview: message.bodyPreview,
        unreadCount: 0,
        isMuted: false,
      })),
      { mode: 'append' },
    )

    const { insertedMessages } = this.messages.appendForAccount(
      accountId,
      'imap',
      older,
      conversationIdsByExternalId,
    )

    return { inserted: insertedMessages.length }
  }

  async composeMail(input: {
    accountId: UUID
    to: string[]
    cc?: string[]
    bcc?: string[]
    subject: string
    body: string
    attachments?: Array<{ fileName: string; mimeType: string; byteSize: number; bytes: Buffer }>
  }): Promise<{ externalMessageId: string }> {
    const { provider, context } = await this.resolveProviderContext(input.accountId)
    if (!(provider instanceof ImapProvider)) {
      throw new AppError('PROVIDER_UNAVAILABLE', "L'envoi libre est disponible uniquement pour IMAP.")
    }
    return provider.composeNew(context, input)
  }

  async connectImapAccount(input: ConnectImapAccountInput): Promise<AccountSummary> {
    const provider = providerRegistry.get('imap')
    if (!(provider instanceof ImapProvider)) {
      throw new AppError('PROVIDER_UNAVAILABLE', "Le service IMAP n'est pas disponible.")
    }

    await provider.verifyCredentials({ imap: input.imap, smtp: input.smtp }, input.password)

    const externalAccountId = `imap:${input.emailAddress.toLowerCase()}`
    const account = this.accounts.upsertConnected({
      providerId: 'imap',
      profile: {
        externalAccountId,
        label: input.label,
        emailAddress: input.emailAddress,
        displayName: input.displayName,
        settings: {
          emailAddress: input.emailAddress,
          imap: input.imap,
          smtp: input.smtp,
          displayName: input.displayName,
        },
      },
    })

    await tokenVault.deleteTokens('imap', account.id)
    await tokenVault.setToken('imap', account.id, 'access', input.password)

    try {
      const syncSummary = await this.syncService.syncAccount(account.id)
      this.emitNotification({
        level: 'success',
        providerId: 'imap',
        accountId: account.id,
        title: `${account.label} est connecte`,
        body: `${syncSummary.conversations} fils et ${syncSummary.messages} messages ont ete recuperes.`,
      })
    } catch (error) {
      this.emitNotification({
        level: 'warning',
        providerId: 'imap',
        accountId: account.id,
        title: `${account.label} est connecte`,
        body: `La connexion est reussie, mais la premiere recuperation a echoue: ${(error as Error).message}`,
      })
    }

    return account
  }

  async refreshAccount(accountId: UUID): Promise<{ conversations: number; messages: number }> {
    const account = this.accounts.get(accountId)
    if (account?.providerId === 'webpage') {
      return { conversations: 0, messages: 0 }
    }
    return this.syncService.syncAccount(accountId)
  }

  async connectWebpageAccount(input: ConnectWebpageAccountInput): Promise<AccountSummary> {
    const url = new URL(input.url)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new AppError('PROVIDER_UNAVAILABLE', "L'URL doit utiliser http ou https.")
    }

    const account = this.accounts.upsertConnected({
      providerId: 'webpage',
      profile: {
        externalAccountId: `webpage:${url.host}${url.pathname}`,
        label: input.label,
        settings: {
          url: url.toString(),
          host: url.host,
          // Garde la page active en arriere-plan par defaut : indispensable pour recevoir
          // les notifications et le compteur de non-lus (titre) quand le compte n'est pas
          // au premier plan. L'utilisateur peut desactiver via l'icone epingle.
          keepAlive: true,
        },
      },
    })

    this.emitNotification({
      level: 'success',
      providerId: 'webpage',
      accountId: account.id,
      title: `${account.label} est ajoute`,
      body: `Connectez-vous directement dans la page pour activer votre session ${url.host}.`,
    })

    return account
  }

  setWebpageKeepAlive(accountId: UUID, keepAlive: boolean): AccountSummary {
    const account = this.accounts.get(accountId)
    if (!account || account.providerId !== 'webpage') {
      throw new AppError('PROVIDER_UNAVAILABLE', "Ce compte n'est pas une page web.")
    }

    this.accounts.updateSettings(accountId, {
      ...account.settings,
      keepAlive,
    })

    const updated = this.accounts.get(accountId)
    if (!updated) {
      throw new AppError('DATABASE_ERROR', "Impossible de relire ce compte.")
    }
    return updated
  }

  // Notification captee dans une page web (Slack/Teams... cf. WebpageView) : on enregistre
  // l'entree pour le centre de notifications, la cloche et la pastille. On NE passe PAS par
  // emitNotification car la page a deja affiche sa propre notification systeme : reemettre
  // un toast natif ferait doublon.
  recordWebpageNotification(accountId: UUID, title: string, body?: string): LocalNotification {
    const account = this.accounts.get(accountId)
    if (!account || account.providerId !== 'webpage') {
      throw new AppError('PROVIDER_UNAVAILABLE', "Ce compte n'est pas une page web.")
    }

    return this.notifications.create({
      level: 'info',
      providerId: 'webpage',
      accountId: account.id,
      title,
      body,
    })
  }

  setWebpageAdBlock(accountId: UUID, enabled: boolean): AccountSummary {
    const account = this.accounts.get(accountId)
    if (!account || account.providerId !== 'webpage') {
      throw new AppError('PROVIDER_UNAVAILABLE', "Ce compte n'est pas une page web.")
    }

    this.accounts.updateSettings(accountId, {
      ...account.settings,
      adBlock: enabled,
    })

    webpageFilterService.setFlags(webpagePartition(accountId), { adBlock: enabled })

    const updated = this.accounts.get(accountId)
    if (!updated) {
      throw new AppError('DATABASE_ERROR', "Impossible de relire ce compte.")
    }
    return updated
  }

  setWebpageFavicon(accountId: UUID, faviconUrl: string | null): AccountSummary {
    const account = this.accounts.get(accountId)
    if (!account || account.providerId !== 'webpage') {
      throw new AppError('PROVIDER_UNAVAILABLE', "Ce compte n'est pas une page web.")
    }

    const nextSettings = { ...account.settings }
    if (faviconUrl) {
      nextSettings.faviconUrl = faviconUrl
    } else {
      delete nextSettings.faviconUrl
    }

    this.accounts.updateSettings(accountId, nextSettings)

    const updated = this.accounts.get(accountId)
    if (!updated) {
      throw new AppError('DATABASE_ERROR', "Impossible de relire ce compte.")
    }
    return updated
  }

  async disconnectAccount(accountId: UUID): Promise<void> {
    const account = this.accounts.get(accountId)
    if (!account) {
      throw new AppError('DATABASE_ERROR', "Ce compte est introuvable.")
    }

    await tokenVault.deleteTokens(account.providerId, account.id)

    if (account.providerId === 'webpage') {
      const partition = webpagePartition(account.id)
      webpageFilterService.remove(partition)
      try {
        await session.fromPartition(partition).clearStorageData()
      } catch {
        // Si le partition n'a jamais ete instancie, rien a nettoyer.
      }
    }

    this.accounts.delete(account.id)

    this.emitNotification({
      level: 'info',
      providerId: account.providerId,
      title: `${account.label} est deconnecte`,
      body: account.providerId === 'webpage'
        ? 'La session web et les cookies associes ont ete effaces.'
        : 'Les conversations locales associees ont ete retirees.',
    })
  }

  async listContacts(accountId: UUID): Promise<ContactSummary[]> {
    const { account, provider, context } = await this.resolveProviderContext(accountId)

    if (!provider.listContacts) {
      throw new AppError('PROVIDER_UNAVAILABLE', "Ce service ne propose pas d'annuaire de contacts.")
    }

    const records = await provider.listContacts(context)
    return records.map((record) => ({
      accountId: account.id,
      externalContactId: record.externalContactId,
      displayName: record.displayName,
      email: record.email,
      presence: record.presence,
    }))
  }

  async openDirectConversation(
    accountId: UUID,
    contactExternalId: string,
  ): Promise<{ conversationId: UUID }> {
    const { account, provider, context } = await this.resolveProviderContext(accountId)

    if (!provider.openDirectConversation) {
      throw new AppError('PROVIDER_UNAVAILABLE', "Ce service ne sait pas encore ouvrir une conversation directe.")
    }

    const opened = await provider.openDirectConversation(context, contactExternalId)
    const conversationId = this.conversations.upsertSingle(account.id, account.providerId, {
      externalConversationId: opened.externalConversationId,
      title: opened.title,
      kind: 'dm',
      unreadCount: 0,
      isMuted: false,
    })

    try {
      await this.syncService.syncFocusedConversation(conversationId)
    } catch {
      // Pas critique : la prochaine sync rapatriera l'historique.
    }

    return { conversationId }
  }

  private async resolveProviderContext(accountId: UUID) {
    const account = this.accounts.get(accountId)
    if (!account) {
      throw new AppError('DATABASE_ERROR', "Ce compte est introuvable.")
    }

    const provider = providerRegistry.get(account.providerId)
    if (!provider) {
      throw new AppError('PROVIDER_UNAVAILABLE', "Ce service n'est pas disponible.")
    }

    const accessToken = await tokenVault.getToken(account.providerId, account.id, 'access')
    if (!accessToken) {
      throw new AppError('AUTH_REQUIRED', 'Ce compte doit etre reconnecte.')
    }

    const refreshToken = await tokenVault.getToken(account.providerId, account.id, 'refresh')
    const context = {
      accountId: account.id,
      providerId: account.providerId,
      externalAccountId: account.externalAccountId,
      settings: account.settings,
      credentials: {
        accessToken,
        refreshToken: refreshToken ?? undefined,
      },
      onCredentialsRefreshed: async (credentials: { accessToken: string; refreshToken?: string }) => {
        await tokenVault.setToken(account.providerId, account.id, 'access', credentials.accessToken)
        if (credentials.refreshToken) {
          await tokenVault.setToken(
            account.providerId,
            account.id,
            'refresh',
            credentials.refreshToken,
          )
        }
      },
    }

    return { account, provider, context }
  }

  private emitNotification(input: Parameters<NotificationRepository['create']>[0]): void {
    const notification = this.notifications.create(input)
    eventBus.emit('notification:created', notification)
  }
}

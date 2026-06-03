import { Buffer } from 'node:buffer'
import { readFile, writeFile } from 'node:fs/promises'
import { app, BrowserWindow, dialog, shell, webContents as electronWebContents } from 'electron'
import { z } from 'zod'
import { AppError } from '@shared/errors'
import { IPC_CHANNELS } from '@shared/ipc'
import {
  isValidAccelerator,
  NAV_SHORTCUT_ACTIONS,
  resolveNavShortcuts,
  type AppNavShortcutAction,
} from '@shared/shortcuts'
import { eventBus } from '@main/events/eventBus'
import { AppBackupService } from '@main/backup/appBackupService'
import { databaseClient } from '@main/database/client'
import { AccountRepository } from '@main/database/repositories/accountRepository'
import { AppSettingsRepository } from '@main/database/repositories/appSettingsRepository'
import { ConversationRepository } from '@main/database/repositories/conversationRepository'
import { HomeLayoutRepository } from '@main/database/repositories/homeLayoutRepository'
import { MessageRepository } from '@main/database/repositories/messageRepository'
import { NotificationRepository } from '@main/database/repositories/notificationRepository'
import { ProviderRepository } from '@main/database/repositories/providerRepository'
import { browserDevtoolsHost } from '@main/browserDevtoolsHost'
import { AttachmentDownloadService } from '@main/providers/attachmentDownloadService'
import { rebuildAppMenu, suspendAppMenu } from '@main/appMenu'
import { BrowserService } from '@main/providers/browserService'
import { autodiscoverMailSettings } from '@main/providers/imap/mailAutodiscover'
import { MessageSendService } from '@main/providers/messageSendService'
import { OmnichatService } from '@main/omnichat/omnichatService'
import { OmnichatIdentityService } from '@main/omnichat/omnichatIdentityService'
import { signalingClient } from '@main/omnichat/signalingClient'
import { ProviderConnectionService } from '@main/providers/providerConnectionService'
import { providerRegistry } from '@main/providers/providerRegistry'
import { ReactionToggleService } from '@main/providers/reactionToggleService'
import { tenorService } from '@main/providers/tenorService'
import { rssService } from '@main/providers/rssService'
import { weatherService } from '@main/providers/weatherService'
import { logger } from '@main/logger'
import type { StartupView } from '@shared/models'
import type { ReminderScheduler } from '@main/reminders/reminderScheduler'
import type { PassVaultService } from '@main/omnipass/passVaultService'
import type { SyncEngine } from '@main/sync/syncEngine'
import type { Weekday } from '@shared/models'
import { autoUpdate } from '@main/update/autoUpdater'
import { getChangelog } from '@main/update/changelog'
import { registerValidatedHandler } from './createIpcRouter'

const providerIdSchema = z.enum(['imap', 'webpage'])
const messageStateSchema = z.enum(['unread', 'read', 'archived', 'snoozed', 'pinned'])
const socketTypeSchema = z.enum(['SSL', 'STARTTLS', 'plain'])
const mailServerSchema = z.object({
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  socketType: socketTypeSchema,
  username: z.string().trim().min(1).max(255),
})
const startupViewSchema = z.enum(['default-home', 'custom-home', 'inbox', 'notifications'])
const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur hexadecimale invalide (format #rrggbb attendu).')
const homeWidgetInstanceSchema = z.object({
  id: z.string().min(1).max(64),
  widgetId: z.string().trim().min(1).max(64),
  x: z.number().int().min(0).max(48),
  y: z.number().int().min(0).max(200),
  w: z.number().int().min(1).max(24),
  h: z.number().int().min(1).max(48),
  config: z.record(z.unknown()).optional(),
})

const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format attendu : HH:mm')
const weekdaySchema = z.custom<Weekday>(
  (value) =>
    typeof value === 'number'
    && Number.isInteger(value)
    && value >= 1
    && value <= 7,
  'Jour invalide (1 a 7)',
)
const reminderRecurrenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('once'), scheduledAt: z.string().datetime() }),
  z.object({ kind: z.literal('daily'), timeOfDay: timeOfDaySchema }),
  z.object({
    kind: z.literal('weekly'),
    weekdays: z.array(weekdaySchema).min(1).max(7),
    timeOfDay: timeOfDaySchema,
  }),
  z.object({
    kind: z.literal('monthly'),
    dayOfMonth: z.number().int().min(1).max(31),
    timeOfDay: timeOfDaySchema,
  }),
  z.object({
    kind: z.literal('interval'),
    everyMinutes: z.number().int().min(1).max(20_160),
  }),
])
const createReminderSchema = z.object({
  title: z.string().trim().min(1).max(140),
  body: z.string().max(500).optional(),
  recurrence: reminderRecurrenceSchema,
  isEnabled: z.boolean().optional(),
})
const updateReminderSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(140).optional(),
  body: z.string().max(500).optional(),
  recurrence: reminderRecurrenceSchema.optional(),
  isEnabled: z.boolean().optional(),
})

const STARTUP_VIEW_KEY = 'startupView'
const DEFAULT_STARTUP_VIEW: StartupView = 'default-home'
const ACCENT_COLOR_KEY = 'accentColor'
const DEFAULT_ACCENT_COLOR = '#8ee6bf'
const BASE_COLOR_KEY = 'baseColor'
const DEFAULT_BASE_COLOR = '#090a0d'
const NAV_SHORTCUTS_KEY = 'navShortcuts'

const browserId = z.string().uuid()
const browserIdList = z.array(z.string().uuid()).max(500)
const browserUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => value.startsWith('https://') || value.startsWith('http://'), {
    message: "L'URL doit utiliser http ou https.",
  })
// Un favicon est une metadonnee cosmetique : une valeur trop longue (gros data: URI),
// d'un schema non supporte ou vide est ramenee a "pas de favicon" plutot que de faire
// echouer toute la requete IPC. Borne aussi le stockage (les data: URIs peuvent etre gros).
const FAVICON_MAX_LENGTH = 65_536
const normalizeFavicon = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? ''
  if (
    trimmed.length === 0
    || trimmed.length > FAVICON_MAX_LENGTH
    || !(
      trimmed.startsWith('https://')
      || trimmed.startsWith('http://')
      || trimmed.startsWith('data:')
    )
  ) {
    return null
  }
  return trimmed
}
const browserFaviconSchema = z
  .string()
  .transform((value) => normalizeFavicon(value) ?? undefined)
  .optional()
const browserNameSchema = z.string().trim().min(1).max(120)
const browserTitleSchema = z.string().trim().max(500).optional()
// Surnom d'onglet : optionnel et nullable (null efface l'override, retour au titre de page).
const browserCustomTitleSchema = z.string().trim().max(120).nullable().optional()
// Origine d'un identifiant enregistre (ex: https://github.com) : http(s) uniquement.
const browserOriginSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => value.startsWith('https://') || value.startsWith('http://'), {
    message: "L'origine doit utiliser http ou https.",
  })
const browserCategoryIdSchema = z.string().uuid().nullable().optional()
const browserLimitSchema = z.number().int().min(1).max(200).optional()
const browserBoundsSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
})

// Resout un webContents de <webview> et verifie qu'il est bien un invite de la fenetre
// appelante (meme garde que pour les touches media). Empeche de cibler un webContents tiers.
const resolveWindowGuest = (
  webContentsId: number,
  sender: Electron.WebContents,
): Electron.WebContents => {
  const target = electronWebContents.fromId(webContentsId)
  if (!target) {
    throw new AppError('PROVIDER_UNAVAILABLE', "Cette page n'est plus active.")
  }
  const host = BrowserWindow.fromWebContents(sender)?.webContents
  if (!host || target.hostWebContents?.id !== host.id) {
    throw new AppError('PROVIDER_UNAVAILABLE', "Cette page n'appartient pas a cette fenetre.")
  }
  return target
}

export const registerIpcHandlers = (
  syncEngine: SyncEngine,
  reminderScheduler: ReminderScheduler,
  passVault: PassVaultService,
): void => {
  const db = databaseClient.open()
  const accounts = new AccountRepository(db)
  const conversations = new ConversationRepository(db)
  const messages = new MessageRepository(db)
  const notifications = new NotificationRepository(db)
  const providers = new ProviderRepository(db)
  const providerConnections = new ProviderConnectionService(db)
  const messageSender = new MessageSendService(db)
  const reactionToggler = new ReactionToggleService(db)
  const attachmentDownloader = new AttachmentDownloadService(db)
  const omnichat = new OmnichatService(db)
  const omnichatIdentity = new OmnichatIdentityService(db)
  const appSettings = new AppSettingsRepository(db)
  const homeLayout = new HomeLayoutRepository(db)
  const browser = new BrowserService(db)
  const appBackup = new AppBackupService(db)

  // Raccourcis de navigation entre apps (Cmd/Ctrl+1..9), persistes en KV et fusionnes
  // avec les defauts. Sert au menu natif et a la reponse du canal GET.
  const getResolvedNavShortcuts = (): Record<AppNavShortcutAction, string> =>
    resolveNavShortcuts(
      appSettings.get<Partial<Record<AppNavShortcutAction, string>>>(NAV_SHORTCUTS_KEY),
    )

  // Applique au menu applicatif les raccourcis sauvegardes (installAppMenu a deja
  // pose les defauts + enregistre les routeurs d'action au demarrage).
  rebuildAppMenu({ browser: browser.getResolvedShortcuts(), nav: getResolvedNavShortcuts() })
  providers.upsertAll(providerRegistry.list())

  registerValidatedHandler(IPC_CHANNELS.APP_GET_BOOTSTRAP, z.undefined(), () => ({
    appVersion: app.getVersion(),
    platform: process.platform,
    databaseReady: true,
    providers: providerRegistry.list(),
  }))

  // Mise a jour applicative (electron-updater) : etat courant pour amorcer l'UI,
  // verification manuelle, et installation de la MAJ telechargee (redemarre l'app).
  registerValidatedHandler(IPC_CHANNELS.APP_GET_UPDATE_STATUS, z.undefined(), () =>
    autoUpdate.getStatus(),
  )

  registerValidatedHandler(IPC_CHANNELS.APP_CHECK_UPDATES, z.undefined(), async () => {
    await autoUpdate.checkForUpdates()
    return { ok: true } as const
  })

  registerValidatedHandler(IPC_CHANNELS.APP_INSTALL_UPDATE, z.undefined(), () => {
    autoUpdate.installUpdate()
    return { ok: true } as const
  })

  // Changelog (CHANGELOG.md empaquete) pour la modal "Nouveautes" affichee apres une MAJ.
  registerValidatedHandler(IPC_CHANNELS.APP_GET_CHANGELOG, z.undefined(), () => getChangelog())

  registerValidatedHandler(IPC_CHANNELS.PROVIDERS_LIST, z.undefined(), () => providerRegistry.list())

  registerValidatedHandler(IPC_CHANNELS.ACCOUNTS_LIST, z.undefined(), () => accounts.list())

  registerValidatedHandler(
    IPC_CHANNELS.ACCOUNTS_REFRESH,
    z.object({ accountId: z.string().uuid() }),
    ({ accountId }) => providerConnections.refreshAccount(accountId),
  )

  registerValidatedHandler(
    IPC_CHANNELS.ACCOUNTS_DISCONNECT,
    z.object({ accountId: z.string().uuid() }),
    async ({ accountId }) => {
      await providerConnections.disconnectAccount(accountId)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.ACCOUNTS_REORDER,
    z.object({ ids: z.array(z.string().uuid()).max(500) }),
    ({ ids }) => accounts.reorder(ids),
  )

  registerValidatedHandler(
    IPC_CHANNELS.IMAP_AUTODISCOVER,
    z.object({ email: z.string().trim().email().max(254) }),
    ({ email }) => autodiscoverMailSettings(email),
  )

  registerValidatedHandler(
    IPC_CHANNELS.IMAP_TEST,
    z.object({
      password: z.string().min(1).max(1024),
      imap: mailServerSchema,
      smtp: mailServerSchema,
    }),
    async (payload) => {
      await providerConnections.testImapCredentials(payload)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.IMAP_CONNECT,
    z.object({
      label: z.string().trim().min(1).max(120),
      emailAddress: z.string().trim().email().max(254),
      displayName: z.string().trim().max(120).optional(),
      password: z.string().min(1).max(1024),
      imap: mailServerSchema,
      smtp: mailServerSchema,
    }),
    (payload) => providerConnections.connectImapAccount(payload),
  )

  registerValidatedHandler(
    IPC_CHANNELS.IMAP_LIST_FOLDERS,
    z.object({ accountId: z.string().uuid() }),
    ({ accountId }) => providerConnections.listImapFolders(accountId),
  )

  registerValidatedHandler(
    IPC_CHANNELS.IMAP_SELECT_FOLDER,
    z.object({
      accountId: z.string().uuid(),
      folderPath: z.string().trim().min(1).max(255),
    }),
    async ({ accountId, folderPath }) => {
      await providerConnections.selectImapFolder(accountId, folderPath)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.IMAP_MARK_READ,
    z.object({
      conversationId: z.string().uuid(),
      read: z.boolean(),
    }),
    async ({ conversationId, read }) => {
      await providerConnections.markImapConversationRead(conversationId, read)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.IMAP_LOAD_MORE,
    z.object({ accountId: z.string().uuid() }),
    async ({ accountId }) => {
      const result = await providerConnections.loadMoreImap(accountId)
      return { ok: true as const, inserted: result.inserted }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.IMAP_DELETE_CONVERSATION,
    z.object({ conversationId: z.string().uuid() }),
    async ({ conversationId }) => {
      await providerConnections.deleteImapConversation(conversationId)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.IMAP_MOVE_CONVERSATION,
    z.object({
      conversationId: z.string().uuid(),
      folderPath: z.string().trim().min(1).max(255),
    }),
    async ({ conversationId, folderPath }) => {
      await providerConnections.moveImapConversation(conversationId, folderPath)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.IMAP_COMPOSE,
    z.object({
      accountId: z.string().uuid(),
      to: z.array(z.string().trim().email()).min(1).max(50),
      cc: z.array(z.string().trim().email()).max(50).optional(),
      bcc: z.array(z.string().trim().email()).max(50).optional(),
      subject: z.string().max(400),
      body: z.string().max(200000),
      attachments: z
        .array(
          z.object({
            fileName: z.string().trim().min(1).max(255),
            mimeType: z.string().trim().max(255),
            byteSize: z.number().int().nonnegative(),
            bytesBase64: z.string().min(1),
          }),
        )
        .max(10)
        .optional(),
    }),
    async (payload) => {
      const attachments = (payload.attachments ?? []).map((attachment) => ({
        fileName: attachment.fileName,
        mimeType: attachment.mimeType || 'application/octet-stream',
        byteSize: attachment.byteSize,
        bytes: Buffer.from(attachment.bytesBase64, 'base64'),
      }))
      const result = await providerConnections.composeMail({
        accountId: payload.accountId,
        to: payload.to,
        cc: payload.cc,
        bcc: payload.bcc,
        subject: payload.subject,
        body: payload.body,
        attachments: attachments.length > 0 ? attachments : undefined,
      })
      return { ok: true as const, externalMessageId: result.externalMessageId }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.WEBPAGE_CONNECT,
    z.object({
      label: z.string().trim().min(1).max(120),
      url: z.string().trim().url().max(2048).refine(
        (value) => value.startsWith('https://') || value.startsWith('http://'),
        { message: "L'URL doit utiliser http ou https." },
      ),
    }),
    (payload) => providerConnections.connectWebpageAccount(payload),
  )

  registerValidatedHandler(
    IPC_CHANNELS.WEBPAGE_SET_KEEP_ALIVE,
    z.object({
      accountId: z.string().uuid(),
      keepAlive: z.boolean(),
    }),
    ({ accountId, keepAlive }) =>
      providerConnections.setWebpageKeepAlive(accountId, keepAlive),
  )

  registerValidatedHandler(
    IPC_CHANNELS.WEBPAGE_SET_FAVICON,
    z.object({
      accountId: z.string().uuid(),
      faviconUrl: z.union([z.string(), z.null()]).transform(normalizeFavicon),
    }),
    ({ accountId, faviconUrl }) =>
      providerConnections.setWebpageFavicon(accountId, faviconUrl),
  )

  registerValidatedHandler(
    IPC_CHANNELS.WEBPAGE_SET_AD_BLOCK,
    z.object({
      accountId: z.string().uuid(),
      enabled: z.boolean(),
    }),
    ({ accountId, enabled }) =>
      providerConnections.setWebpageAdBlock(accountId, enabled),
  )

  registerValidatedHandler(
    IPC_CHANNELS.WEBPAGE_NOTIFY,
    z.object({
      accountId: z.string().uuid(),
      title: z.string().trim().min(1).max(200),
      body: z.string().trim().max(500).optional(),
    }),
    ({ accountId, title, body }, event) => {
      const notification = providerConnections.recordWebpageNotification(accountId, title, body)
      // Les pages embarquees (Teams/Slack) ne sonnent que si elles se croient en
      // arriere-plan ; montees en permanence (keepAlive), elles restent souvent
      // muettes. Quand la fenetre Omnidesk n'est pas au premier plan, on emet donc
      // nous-memes le toast natif (son) au lieu de dependre du silence de la page.
      const senderWindow = BrowserWindow.fromWebContents(event.sender)
      if (senderWindow && !senderWindow.isFocused()) {
        eventBus.emit('notification:created', notification)
      }
      return notification
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.WEBVIEW_SEND_MEDIA_KEY,
    z.object({
      webContentsId: z.number().int().positive(),
      key: z.enum(['play-pause', 'next', 'previous', 'stop']),
    }),
    ({ webContentsId, key }, event) => {
      const target = electronWebContents.fromId(webContentsId)
      if (!target) {
        throw new AppError('PROVIDER_UNAVAILABLE', "Cette page n'est plus active.")
      }
      const host = BrowserWindow.fromWebContents(event.sender)?.webContents
      if (!host || target.hostWebContents?.id !== host.id) {
        throw new AppError('PROVIDER_UNAVAILABLE', "Cette page n'appartient pas a cette fenetre.")
      }
      const keyCodeByAction = {
        'play-pause': 'MediaPlayPause',
        next: 'MediaNextTrack',
        previous: 'MediaPreviousTrack',
        stop: 'MediaStop',
      } as const
      const keyCode = keyCodeByAction[key]
      target.sendInputEvent({ type: 'keyDown', keyCode })
      target.sendInputEvent({ type: 'keyUp', keyCode })
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.ACCOUNTS_CREATE_DRAFT,
    z.object({
      providerId: providerIdSchema,
      label: z.string().trim().min(1).max(120),
      emailAddress: z.string().trim().email().optional(),
      displayName: z.string().trim().max(120).optional(),
      imapHost: z.string().trim().max(255).optional(),
      imapPort: z.number().int().min(1).max(65535).optional(),
      smtpHost: z.string().trim().max(255).optional(),
      smtpPort: z.number().int().min(1).max(65535).optional(),
    }),
    (payload) => accounts.createDraft(payload),
  )

  registerValidatedHandler(
    IPC_CHANNELS.CONVERSATIONS_LIST,
    z
      .object({
        query: z.string().trim().max(160).optional(),
        accountId: z.string().uuid().optional(),
        unreadOnly: z.boolean().optional(),
      })
      .optional(),
    (payload) => conversations.list(payload),
  )

  registerValidatedHandler(
    IPC_CHANNELS.CONVERSATIONS_GET,
    z.object({ conversationId: z.string().uuid() }),
    ({ conversationId }) => conversations.get(conversationId),
  )

  registerValidatedHandler(
    IPC_CHANNELS.CONVERSATIONS_FOCUS,
    z.object({ conversationId: z.string().uuid().nullable() }),
    ({ conversationId }) => {
      syncEngine.setFocusedConversation(conversationId ?? undefined)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.CONVERSATIONS_LOOKUP_EXTERNAL,
    z.object({
      accountId: z.string().uuid(),
      externalConversationId: z.string().min(1).max(64),
    }),
    ({ accountId, externalConversationId }) =>
      conversations.findByExternal(accountId, externalConversationId),
  )

  registerValidatedHandler(
    IPC_CHANNELS.CONTACTS_LIST,
    z.object({ accountId: z.string().uuid() }),
    ({ accountId }) => providerConnections.listContacts(accountId),
  )

  registerValidatedHandler(
    IPC_CHANNELS.CONVERSATIONS_OPEN_DIRECT,
    z.object({
      accountId: z.string().uuid(),
      contactExternalId: z.string().min(1).max(64),
    }),
    ({ accountId, contactExternalId }) =>
      providerConnections.openDirectConversation(accountId, contactExternalId),
  )

  registerValidatedHandler(
    IPC_CHANNELS.MESSAGES_UPDATE_STATE,
    z.object({
      messageId: z.string().uuid(),
      state: messageStateSchema,
      enabled: z.boolean(),
    }),
    (payload) => messages.updateState(payload),
  )

  registerValidatedHandler(
    IPC_CHANNELS.MESSAGES_SEND,
    z
      .object({
        conversationId: z.string().uuid(),
        body: z.string().max(40000),
        attachments: z
          .array(
            z.object({
              fileName: z.string().trim().min(1).max(255),
              mimeType: z.string().trim().max(255),
              byteSize: z.number().int().nonnegative(),
              bytesBase64: z.string().min(1),
            }),
          )
          .max(10)
          .optional(),
      })
      .refine(
        (value) => value.body.trim().length > 0 || (value.attachments && value.attachments.length > 0),
        { message: 'Un message doit contenir du texte ou un fichier.' },
      ),
    (payload) => messageSender.send(payload),
  )

  registerValidatedHandler(
    IPC_CHANNELS.MESSAGES_TOGGLE_REACTION,
    z.object({
      messageId: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
      enabled: z.boolean(),
    }),
    (payload) => reactionToggler.toggle(payload),
  )

  registerValidatedHandler(
    IPC_CHANNELS.ATTACHMENTS_OPEN,
    z.object({ attachmentId: z.string().uuid() }),
    async ({ attachmentId }) => {
      const result = await attachmentDownloader.ensureLocalCopy(attachmentId)
      const failure = await shell.openPath(result.localPath)
      if (failure) {
        throw new AppError('PROVIDER_UNAVAILABLE', failure)
      }
      return { ok: true as const, localPath: result.localPath }
    },
  )

  // --- Omnichat (LiveKit via OmniProxy) -----------------------------------

  // Salle d'appel ad-hoc : un identifiant opaque (pas un uuid de conversation) prefixe
  // 'omnichat:call:'. L'acces reel est de toute facon gate cote OmniProxy (autorite).
  const callRoomSchema = z.string().trim().min(1).max(200).startsWith('omnichat:call:')
  const callIdSchema = z.string().trim().min(1).max(200)

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_GET_CALL_TOKEN,
    z.object({ callId: callIdSchema, room: callRoomSchema }),
    ({ callId, room }) => omnichat.getCallToken(callId, room),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_START_RECORDING,
    z.object({ callId: callIdSchema, room: callRoomSchema }),
    ({ callId, room }) => omnichat.startRecording(callId, room),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_STOP_RECORDING,
    z.object({ egressId: z.string().trim().min(1).max(200) }),
    ({ egressId }) => omnichat.stopRecording(egressId),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_WATCH_GROUP,
    z.object({ conversationId: z.string().uuid().nullable() }),
    ({ conversationId }) => {
      signalingClient.watchGroup(conversationId)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_SET_GROUP_CALL,
    z.object({
      conversationId: z.string().uuid(),
      callId: callIdSchema,
      room: callRoomSchema,
      active: z.boolean(),
    }),
    ({ conversationId, callId, room, active }) => {
      signalingClient.setGroupCall(conversationId, callId, room, active)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(IPC_CHANNELS.OMNICHAT_AVAILABILITY, z.undefined(), () => ({
    available: omnichat.isAvailable(),
  }))

  // --- Omnichat (messagerie native temps reel via WebSocket OmniProxy) -----

  registerValidatedHandler(IPC_CHANNELS.OMNICHAT_GET_IDENTITY, z.undefined(), () => ({
    identity: omnichatIdentity.peek(),
    connected: signalingClient.isConnected(),
  }))

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_SET_IDENTITY,
    z.object({ pseudo: z.string().trim().min(1).max(80) }),
    ({ pseudo }) => {
      omnichatIdentity.setIdentity(pseudo)
      // Reconnecte avec la nouvelle identite (nouveau hello). isConnected sera
      // false le temps du re-welcome ; le renderer recoit ensuite l'evenement.
      signalingClient.restart()
      return {
        identity: omnichatIdentity.peek(),
        connected: signalingClient.isConnected(),
      }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_ADD_CONTACT,
    z.object({
      pseudo: z.string().trim().min(1).max(80),
      id: z.string().trim().min(1).max(200),
    }),
    ({ pseudo, id }) => signalingClient.addContact(pseudo, id),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_REMOVE_CONTACT,
    z.object({ id: z.string().trim().min(1).max(200) }),
    ({ id }) => {
      signalingClient.removeContact(id)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(IPC_CHANNELS.OMNICHAT_LIST_CONTACTS, z.undefined(), () =>
    signalingClient.listContacts(),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_OPEN_DM,
    z.object({ peerId: z.string().trim().min(1).max(200) }),
    ({ peerId }) => signalingClient.openDm(peerId),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_DM_PEER,
    z.object({ conversationId: z.string().uuid() }),
    ({ conversationId }) => ({ userId: signalingClient.dmPeerId(conversationId) }),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_CREATE_GROUP,
    z.object({
      title: z.string().trim().min(1).max(160),
      // Identifiants (UUID), pas des emails. Tableau vide autorise : groupe solo (le
      // main ajoute self avant d'emettre group-create, cf. signalingClient.createGroup).
      members: z.array(z.string().trim().min(1).max(200)).max(64),
    }),
    ({ title, members }) => signalingClient.createGroup(title, members),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_UPDATE_GROUP,
    z.object({
      conversationId: z.string().uuid(),
      title: z.string().trim().min(1).max(160).optional(),
      addMembers: z.array(z.string().trim().min(1).max(200)).max(64).optional(),
      removeMembers: z.array(z.string().trim().min(1).max(200)).max(64).optional(),
    }),
    ({ conversationId, title, addMembers, removeMembers }) =>
      signalingClient.updateGroup(conversationId, { title, addMembers, removeMembers }),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_SEND,
    z.object({ conversationId: z.string().uuid(), body: z.string().trim().min(1).max(8000) }),
    ({ conversationId, body }) => signalingClient.sendToConversation(conversationId, body),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_TYPING,
    z.object({ conversationId: z.string().uuid(), state: z.enum(['start', 'stop']) }),
    ({ conversationId, state }) => {
      signalingClient.sendTyping(conversationId, state)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_SEND_RECEIPT,
    z.object({
      conversationId: z.string().uuid(),
      serverMsgId: z.string().trim().min(1).max(200),
      state: z.enum(['delivered', 'read']),
    }),
    ({ conversationId, serverMsgId, state }) => {
      signalingClient.sendReceipt(conversationId, serverMsgId, state)
      return { ok: true as const }
    },
  )

  const callMediaSchema = z.enum(['audio', 'video'])
  const callDeclineReasonSchema = z.enum(['busy', 'declined', 'timeout', 'unavailable'])

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_CALL_INVITE,
    z.object({
      callId: callIdSchema,
      room: callRoomSchema,
      userId: z.string().trim().min(1).max(200),
      media: callMediaSchema,
    }),
    ({ callId, room, userId, media }) => {
      signalingClient.inviteToCall(userId, callId, room, media)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_CALL_ACCEPT,
    z.object({ from: z.string().trim().min(1).max(200), callId: callIdSchema }),
    ({ from, callId }) => {
      signalingClient.callAccept(from, callId)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_CALL_DECLINE,
    z.object({
      from: z.string().trim().min(1).max(200),
      callId: callIdSchema,
      reason: callDeclineReasonSchema.optional(),
    }),
    ({ from, callId, reason }) => {
      signalingClient.callDecline(from, callId, reason)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_CALL_CANCEL,
    z.object({ from: z.string().trim().min(1).max(200), callId: callIdSchema }),
    ({ from, callId }) => {
      signalingClient.callCancel(from, callId)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_JOIN_GROUP,
    z.object({ groupId: z.string().trim().min(1).max(200) }),
    ({ groupId }) => signalingClient.joinGroup(groupId),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_LEAVE_GROUP,
    z.object({ conversationId: z.string().uuid() }),
    ({ conversationId }) => signalingClient.leaveGroup(conversationId),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNICHAT_GROUP_CODE,
    z.object({ conversationId: z.string().uuid() }),
    ({ conversationId }) => {
      const ref = conversations.getProviderRef(conversationId)
      const code =
        ref && ref.providerId === 'omnichat' && ref.externalConversationId.startsWith('group:')
          ? ref.externalConversationId.slice('group:'.length)
          : null
      return { code }
    },
  )

  registerValidatedHandler(IPC_CHANNELS.TENOR_STATUS, z.undefined(), () => ({
    ready: tenorService.isReady(),
  }))

  registerValidatedHandler(
    IPC_CHANNELS.TENOR_FEATURED,
    z.object({ limit: z.number().int().min(1).max(50).optional() }).optional(),
    (payload) => tenorService.featured(payload?.limit),
  )

  registerValidatedHandler(
    IPC_CHANNELS.TENOR_SEARCH,
    z.object({
      query: z.string().trim().min(1).max(200),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    ({ query, limit }) => tenorService.search(query, limit),
  )

  registerValidatedHandler(IPC_CHANNELS.SETTINGS_GET_STARTUP_VIEW, z.undefined(), () => ({
    view: appSettings.get<StartupView>(STARTUP_VIEW_KEY) ?? DEFAULT_STARTUP_VIEW,
  }))

  registerValidatedHandler(
    IPC_CHANNELS.SETTINGS_SET_STARTUP_VIEW,
    z.object({ view: startupViewSchema }),
    ({ view }) => {
      appSettings.set<StartupView>(STARTUP_VIEW_KEY, view)
      return { view }
    },
  )

  // Couleur d'accent personnalisable. Validee cote main (regex hex) pour ne jamais
  // stocker une valeur non fiable venue du renderer.
  registerValidatedHandler(IPC_CHANNELS.SETTINGS_GET_ACCENT_COLOR, z.undefined(), () => ({
    color: appSettings.get<string>(ACCENT_COLOR_KEY) ?? DEFAULT_ACCENT_COLOR,
  }))

  registerValidatedHandler(
    IPC_CHANNELS.SETTINGS_SET_ACCENT_COLOR,
    z.object({ color: hexColorSchema }),
    ({ color }) => {
      appSettings.set<string>(ACCENT_COLOR_KEY, color)
      return { color }
    },
  )

  // Couleur de fond personnalisable (le "noir de base"). Meme validation hex que
  // l'accent ; liberte totale cote couleur (aucune contrainte de luminosite).
  registerValidatedHandler(IPC_CHANNELS.SETTINGS_GET_BASE_COLOR, z.undefined(), () => ({
    color: appSettings.get<string>(BASE_COLOR_KEY) ?? DEFAULT_BASE_COLOR,
  }))

  registerValidatedHandler(
    IPC_CHANNELS.SETTINGS_SET_BASE_COLOR,
    z.object({ color: hexColorSchema }),
    ({ color }) => {
      appSettings.set<string>(BASE_COLOR_KEY, color)
      return { color }
    },
  )

  // Raccourcis de navigation : on renvoie les seuls overrides utilisateur (les defauts
  // sont fusionnes cote renderer via resolveNavShortcuts).
  registerValidatedHandler(IPC_CHANNELS.SETTINGS_GET_NAV_SHORTCUTS, z.undefined(), () => ({
    shortcuts:
      appSettings.get<Partial<Record<AppNavShortcutAction, string>>>(NAV_SHORTCUTS_KEY) ?? {},
  }))

  registerValidatedHandler(
    IPC_CHANNELS.SETTINGS_SET_NAV_SHORTCUTS,
    z.object({ shortcuts: z.record(z.string().max(40), z.string().max(120)) }),
    ({ shortcuts }) => {
      // On ne conserve que les actions connues associees a un accelerateur valide :
      // le menu natif ne recoit ainsi jamais de combinaison invalide.
      const sanitized: Partial<Record<AppNavShortcutAction, string>> = {}
      for (const action of NAV_SHORTCUT_ACTIONS) {
        const value = shortcuts[action]
        if (typeof value === 'string' && isValidAccelerator(value)) {
          sanitized[action] = value
        }
      }
      appSettings.set<Partial<Record<AppNavShortcutAction, string>>>(NAV_SHORTCUTS_KEY, sanitized)
      // Le remappage doit etre repercute sur le menu natif a chaud.
      rebuildAppMenu({ nav: getResolvedNavShortcuts() })
      return { shortcuts: sanitized }
    },
  )

  registerValidatedHandler(IPC_CHANNELS.HOME_GET_LAYOUT, z.undefined(), () => {
    const widgets = homeLayout.list()
    logger.info('[home] get-layout', {
      count: widgets.length,
      configs: widgets.map((widget) => ({ id: widget.id, widgetId: widget.widgetId, hasConfig: Boolean(widget.config) })),
    })
    return { widgets }
  })

  registerValidatedHandler(
    IPC_CHANNELS.HOME_SAVE_LAYOUT,
    z.object({ widgets: z.array(homeWidgetInstanceSchema).max(64) }),
    ({ widgets }) => {
      logger.info('[home] save-layout', {
        count: widgets.length,
        configs: widgets.map((widget) => ({ id: widget.id, widgetId: widget.widgetId, hasConfig: Boolean(widget.config), config: widget.config })),
      })
      return { widgets: homeLayout.replaceAll(widgets) }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.WEATHER_FETCH,
    z
      .object({
        query: z.string().trim().min(1).max(120).optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        label: z.string().trim().max(160).optional(),
      })
      .refine(
        (value) =>
          (typeof value.latitude === 'number' && typeof value.longitude === 'number') ||
          (typeof value.query === 'string' && value.query.length > 0),
        { message: 'Indiquez une ville ou des coordonnees.' },
      ),
    (payload) => weatherService.fetch(payload),
  )

  registerValidatedHandler(
    IPC_CHANNELS.WEATHER_SEARCH_CITIES,
    z.object({ query: z.string().trim().min(1).max(120) }),
    ({ query }) => weatherService.searchCities(query),
  )

  registerValidatedHandler(
    IPC_CHANNELS.RSS_FETCH,
    z.object({
      url: z.string().trim().min(1).max(2048).url(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    ({ url, limit }) => rssService.fetch(url, limit),
  )

  registerValidatedHandler(IPC_CHANNELS.SETTINGS_GET_LOCAL_STATUS, z.undefined(), () => ({
    appVersion: app.getVersion(),
    platform: process.platform,
    databasePath: databaseClient.getPath(),
    databaseReady: true,
    providers: providers.list().map((provider) => ({
      ...provider,
      authReady: providerRegistry.get(provider.id)?.descriptor.authReady ?? false,
    })),
    accountsCount: accounts.count(),
    security: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      tokenStorage: 'safeStorage' as const,
    },
  }))

  registerValidatedHandler(
    IPC_CHANNELS.NOTIFICATIONS_LIST,
    z.object({ unreadOnly: z.boolean().optional() }).optional(),
    (payload) => notifications.list(payload),
  )

  registerValidatedHandler(
    IPC_CHANNELS.NOTIFICATIONS_MARK_READ,
    z.object({ notificationId: z.string().uuid() }),
    ({ notificationId }) => {
      notifications.markRead(notificationId)
      return { ok: true }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.NOTIFICATIONS_MARK_READ_FOR_CONVERSATION,
    z.object({ conversationId: z.string().uuid() }),
    ({ conversationId }) => {
      const markedRead = notifications.markReadByConversation(conversationId)
      return { ok: true as const, markedRead }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.CONVERSATIONS_MARK_READ,
    z.object({ conversationId: z.string().uuid() }),
    ({ conversationId }) => {
      // Marquage lu local, tous providers (omnichat compris) : on remet a zero les
      // messages non lus ET les notifications liees, les deux sources du compteur
      // de non-lus (cf. ConversationRepository.list). Sans ca, ouvrir une conv
      // omnichat ne vidait pas la pastille (pas de notif -> ancien chemin no-op).
      messages.markConversationRead(conversationId, true)
      notifications.markReadByConversation(conversationId)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(IPC_CHANNELS.NOTIFICATIONS_CLEAR_ALL, z.undefined(), () => {
    const cleared = notifications.clearAll()
    return { ok: true as const, cleared }
  })

  registerValidatedHandler(IPC_CHANNELS.REMINDERS_LIST, z.undefined(), () =>
    reminderScheduler.list(),
  )

  registerValidatedHandler(IPC_CHANNELS.REMINDERS_CREATE, createReminderSchema, (input) =>
    reminderScheduler.create(input),
  )

  registerValidatedHandler(IPC_CHANNELS.REMINDERS_UPDATE, updateReminderSchema, (input) =>
    reminderScheduler.update(input),
  )

  registerValidatedHandler(
    IPC_CHANNELS.REMINDERS_DELETE,
    z.object({ id: z.string().uuid() }),
    ({ id }) => {
      reminderScheduler.delete(id)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.APP_SET_BADGE_COUNT,
    z.object({ count: z.number().int().min(0) }),
    ({ count }) => {
      // Pastille du dock (macOS) / lanceur (Linux). Sur Windows, setBadgeCount
      // n'est pas supporte et renvoie false : c'est un no-op sans effet de bord.
      const applied = app.setBadgeCount(count)
      if (!applied && process.platform !== 'win32') {
        logger.warn('[app] setBadgeCount a echoue', { count, platform: process.platform })
      }
      return { ok: true as const }
    },
  )

  registerValidatedHandler(IPC_CHANNELS.WINDOW_MINIMIZE, z.undefined(), (_payload, event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
    return { ok: true }
  })

  registerValidatedHandler(IPC_CHANNELS.WINDOW_MAXIMIZE, z.undefined(), (_payload, event) => {
    const window = BrowserWindow.fromWebContents(event.sender)

    if (!window) {
      return { ok: true, isMaximized: false }
    }

    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }

    return { ok: true, isMaximized: window.isMaximized() }
  })

  registerValidatedHandler(IPC_CHANNELS.WINDOW_CLOSE, z.undefined(), (_payload, event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
    return { ok: true }
  })

  registerValidatedHandler(
    IPC_CHANNELS.SHELL_OPEN_EXTERNAL,
    z.object({ url: z.string().url() }),
    async ({ url }) => {
      await shell.openExternal(url)
      return { ok: true as const }
    },
  )

  // --- OmniBrowser : espaces ----------------------------------------------

  registerValidatedHandler(IPC_CHANNELS.OMNIBROWSER_SPACES_LIST, z.undefined(), () =>
    browser.listSpaces(),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_SPACES_CREATE,
    z.object({
      name: browserNameSchema,
      icon: z.string().trim().max(64).optional(),
      color: z.string().trim().max(32).optional(),
    }),
    (payload) => browser.createSpace(payload),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_SPACES_UPDATE,
    z.object({
      id: browserId,
      name: browserNameSchema.optional(),
      icon: z.string().trim().max(64).optional(),
      color: z.string().trim().max(32).optional(),
    }),
    (payload) => browser.updateSpace(payload),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_SPACES_DELETE,
    z.object({ id: browserId }),
    async ({ id }) => {
      await browser.deleteSpace(id)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_SPACES_REORDER,
    z.object({ ids: browserIdList }),
    ({ ids }) => browser.reorderSpaces(ids),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_SPACES_SET_ACTIVE,
    z.object({ id: browserId }),
    ({ id }) => {
      browser.setActiveSpace(id)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_SPACES_SET_AD_BLOCK,
    z.object({ spaceId: browserId, enabled: z.boolean() }),
    ({ spaceId, enabled }) => browser.setSpaceAdBlock(spaceId, enabled),
  )

  // --- OmniBrowser : categories -------------------------------------------

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_CATEGORIES_LIST,
    z.object({ spaceId: browserId }),
    ({ spaceId }) => browser.listCategories(spaceId),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_CATEGORIES_CREATE,
    z.object({ spaceId: browserId, name: browserNameSchema }),
    ({ spaceId, name }) => browser.createCategory(spaceId, name),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_CATEGORIES_UPDATE,
    z.object({ id: browserId, name: browserNameSchema }),
    ({ id, name }) => browser.updateCategory(id, name),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_CATEGORIES_DELETE,
    z.object({ id: browserId }),
    ({ id }) => {
      browser.deleteCategory(id)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_CATEGORIES_REORDER,
    z.object({ spaceId: browserId, ids: browserIdList }),
    ({ spaceId, ids }) => browser.reorderCategories(spaceId, ids),
  )

  // --- OmniBrowser : favoris ----------------------------------------------

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_LIST,
    z.object({ spaceId: browserId }),
    ({ spaceId }) => browser.listBookmarks(spaceId),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_CREATE,
    z.object({
      spaceId: browserId,
      categoryId: browserCategoryIdSchema,
      title: z.string().trim().min(1).max(255),
      url: browserUrlSchema,
      faviconUrl: browserFaviconSchema,
    }),
    (payload) => browser.createBookmark(payload),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_UPDATE,
    z.object({
      id: browserId,
      title: z.string().trim().min(1).max(255).optional(),
      url: browserUrlSchema.optional(),
      faviconUrl: browserFaviconSchema,
      categoryId: browserCategoryIdSchema,
    }),
    (payload) => browser.updateBookmark(payload),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_DELETE,
    z.object({ id: browserId }),
    ({ id }) => {
      browser.deleteBookmark(id)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_REORDER,
    z.object({ spaceId: browserId, ids: browserIdList }),
    ({ spaceId, ids }) => browser.reorderBookmarks(spaceId, ids),
  )

  // --- OmniBrowser : historique -------------------------------------------

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_HISTORY_RECORD,
    z.object({
      spaceId: browserId,
      url: browserUrlSchema,
      title: browserTitleSchema,
      faviconUrl: browserFaviconSchema,
    }),
    (payload) => browser.recordHistory(payload),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_HISTORY_LIST,
    z.object({
      spaceId: browserId,
      limit: browserLimitSchema,
      before: z.string().datetime().optional(),
    }),
    ({ spaceId, limit, before }) => browser.listHistory(spaceId, { limit, before }),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_HISTORY_SEARCH,
    z.object({
      spaceId: browserId,
      query: z.string().trim().min(1).max(200),
      limit: browserLimitSchema,
    }),
    ({ spaceId, query, limit }) => browser.searchHistory(spaceId, query, limit),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_HISTORY_DELETE,
    z.object({ id: browserId }),
    ({ id }) => {
      browser.deleteHistory(id)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_HISTORY_CLEAR,
    z.object({ spaceId: browserId }),
    ({ spaceId }) => {
      browser.clearHistory(spaceId)
      return { ok: true as const }
    },
  )

  // --- OmniBrowser : onglets ----------------------------------------------

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_TABS_LIST,
    z.object({ spaceId: browserId }),
    ({ spaceId }) => browser.listTabs(spaceId),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_TABS_UPSERT,
    z.object({
      id: z.string().uuid().optional(),
      spaceId: browserId,
      url: browserUrlSchema,
      title: browserTitleSchema,
      customTitle: browserCustomTitleSchema,
      faviconUrl: browserFaviconSchema,
      isPinned: z.boolean().optional(),
      isActive: z.boolean().optional(),
    }),
    (payload) => browser.upsertTab(payload),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_TABS_SET_ACTIVE,
    z.object({ spaceId: browserId, tabId: z.string().uuid() }),
    ({ spaceId, tabId }) => {
      browser.setActiveTab(spaceId, tabId)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_TABS_CLOSE,
    z.object({ id: browserId }),
    ({ id }) => {
      browser.closeTab(id)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_TABS_REORDER,
    z.object({ spaceId: browserId, ids: browserIdList }),
    ({ spaceId, ids }) => browser.reorderTabs(spaceId, ids),
  )

  // --- OmniBrowser : omnibox ----------------------------------------------

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_OMNIBOX_SUGGEST,
    z.object({ spaceId: browserId, query: z.string().trim().max(200), limit: browserLimitSchema }),
    ({ spaceId, query, limit }) => browser.suggest(spaceId, query, limit),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_TABS_SET_GROUP,
    z.object({ tabId: z.string().uuid(), groupId: z.string().uuid().nullable() }),
    ({ tabId, groupId }) => browser.setTabGroup(tabId, groupId) ?? null,
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_TABS_SET_TITLE,
    z.object({ tabId: z.string().uuid(), title: z.string().trim().max(120).nullable() }),
    ({ tabId, title }) => browser.setTabTitle(tabId, title) ?? null,
  )

  // --- OmniBrowser : groupes d'onglets ------------------------------------

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_LIST,
    z.object({ spaceId: browserId }),
    ({ spaceId }) => browser.listTabGroups(spaceId),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_CREATE,
    z.object({ spaceId: browserId, name: browserNameSchema, color: z.string().trim().max(32).optional() }),
    ({ spaceId, name, color }) => browser.createTabGroup(spaceId, name, color),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_UPDATE,
    z.object({
      id: browserId,
      name: browserNameSchema.optional(),
      color: z.string().trim().max(32).optional(),
      isCollapsed: z.boolean().optional(),
    }),
    (payload) => browser.updateTabGroup(payload),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_DELETE,
    z.object({ id: browserId }),
    ({ id }) => {
      browser.deleteTabGroup(id)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_REORDER,
    z.object({ spaceId: browserId, ids: browserIdList }),
    ({ spaceId, ids }) => browser.reorderTabGroups(spaceId, ids),
  )

  // --- OmniBrowser : reglages ---------------------------------------------

  registerValidatedHandler(IPC_CHANNELS.OMNIBROWSER_SETTINGS_GET, z.undefined(), () =>
    browser.getSettings(),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_SETTINGS_UPDATE,
    z.object({
      searchEngineId: z.string().trim().min(1).max(64).optional(),
      sidebarCollapsed: z.boolean().optional(),
      customSearchName: z.string().trim().max(60).optional(),
      customSearchTemplate: z.string().trim().max(2048).optional(),
      shortcuts: z.record(z.string().max(40), z.string().max(120)).optional(),
    }),
    (payload) => {
      const next = browser.updateSettings(payload)
      // Le remappage des raccourcis doit etre repercute sur le menu natif a chaud.
      if (payload.shortcuts) {
        rebuildAppMenu({ browser: browser.getResolvedShortcuts() })
      }
      return next
    },
  )

  // Suspend le menu natif pendant la capture d'une combinaison (sinon ses
  // accelerateurs intercepteraient la frappe), puis le restaure.
  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_SHORTCUTS_CAPTURE,
    z.object({ capturing: z.boolean() }),
    ({ capturing }) => {
      if (capturing) {
        suspendAppMenu()
      } else {
        // Restaure tout le menu (raccourcis navigateur ET navigation entre apps).
        rebuildAppMenu({ browser: browser.getResolvedShortcuts(), nav: getResolvedNavShortcuts() })
      }
      return { ok: true as const }
    },
  )

  // --- OmniBrowser : extensions -------------------------------------------

  registerValidatedHandler(IPC_CHANNELS.OMNIBROWSER_EXTENSIONS_LIST, z.undefined(), () =>
    browser.listExtensions(),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_EXTENSIONS_ADD,
    z.undefined(),
    async (_payload, event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.OpenDialogOptions = {
        title: "Choisir le dossier d'une extension Chromium (décompressée)",
        properties: ['openDirectory'],
      }
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      const directory = result.filePaths[0]
      if (result.canceled || !directory) {
        return null
      }
      return browser.addExtension(directory)
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_EXTENSIONS_SET_ENABLED,
    z.object({ id: browserId, enabled: z.boolean() }),
    ({ id, enabled }) => browser.setExtensionEnabled(id, enabled),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_EXTENSIONS_REMOVE,
    z.object({ id: browserId }),
    async ({ id }) => {
      await browser.removeExtension(id)
      return { ok: true as const }
    },
  )

  // --- OmniBrowser : DevTools embarquees (dockees dans un panneau) ----------

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_ATTACH,
    z.object({
      guestWebContentsId: z.number().int().positive(),
      bounds: browserBoundsSchema,
      inspectX: z.number().int().optional(),
      inspectY: z.number().int().optional(),
    }),
    ({ guestWebContentsId, bounds, inspectX, inspectY }, event) => {
      const guest = resolveWindowGuest(guestWebContentsId, event.sender)
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) {
        throw new AppError('PROVIDER_UNAVAILABLE', 'Fenetre introuvable.')
      }
      const inspect =
        typeof inspectX === 'number' && typeof inspectY === 'number'
          ? { x: inspectX, y: inspectY }
          : undefined
      // L'UI DevTools est rendue dans une WebContentsView native dockee a ces dimensions.
      browserDevtoolsHost.attach(window, guest, bounds, inspect)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_SET_BOUNDS,
    z.object({ bounds: browserBoundsSchema, visible: z.boolean() }),
    ({ bounds, visible }) => {
      browserDevtoolsHost.setBounds(bounds, visible)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_DETACH,
    z.object({ guestWebContentsId: z.number().int().positive() }),
    () => {
      browserDevtoolsHost.destroy()
      return { ok: true as const }
    },
  )

  // Repli pour les pages web epinglees (hors OmniBrowser) : DevTools en fenetre detachee.
  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_INSPECT,
    z.object({
      webContentsId: z.number().int().positive(),
      x: z.number().int(),
      y: z.number().int(),
    }),
    ({ webContentsId, x, y }, event) => {
      const guest = resolveWindowGuest(webContentsId, event.sender)
      guest.inspectElement(x, y)
      return { ok: true as const }
    },
  )

  // --- OmniBrowser : gestionnaire de mots de passe ------------------------

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_CREDENTIALS_SAVE,
    z.object({
      origin: browserOriginSchema,
      username: z.string().trim().min(1).max(255),
      password: z.string().min(1).max(1024),
    }),
    (payload) => {
      logger.info('[cred-debug] save', { origin: payload.origin, username: payload.username })
      return browser.saveCredential(payload)
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_CREDENTIALS_FOR_ORIGIN,
    z.object({ origin: browserOriginSchema }),
    ({ origin }) => {
      const result = browser.getCredentialForOrigin(origin)
      logger.info('[cred-debug] for-origin', { origin, found: result !== null })
      return result
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_CREDENTIALS_LIST,
    z.undefined(),
    () => browser.listCredentials(),
  )

  registerValidatedHandler(
    IPC_CHANNELS.OMNIBROWSER_CREDENTIALS_DELETE,
    z.object({ id: browserId }),
    ({ id }) => {
      browser.deleteCredential(id)
      return { ok: true as const }
    },
  )

  // --- Omnipass (coffre de mots de passe zero-knowledge) ---
  // redactPayload sur create-vault/unlock : le mot de passe maitre ne doit jamais etre journalise.
  registerValidatedHandler(IPC_CHANNELS.PASSVAULT_GET_STATUS, z.undefined(), () =>
    passVault.getStatus(),
  )

  registerValidatedHandler(
    IPC_CHANNELS.PASSVAULT_CREATE,
    z.object({ masterPassword: z.string().min(1).max(1024) }),
    ({ masterPassword }) => passVault.createVault(masterPassword),
    { redactPayload: true },
  )

  registerValidatedHandler(
    IPC_CHANNELS.PASSVAULT_UNLOCK,
    z.object({ masterPassword: z.string().min(1).max(1024) }),
    ({ masterPassword }) => passVault.unlock(masterPassword),
    { redactPayload: true },
  )

  registerValidatedHandler(IPC_CHANNELS.PASSVAULT_LOCK, z.undefined(), () => passVault.lock())

  registerValidatedHandler(IPC_CHANNELS.PASSVAULT_LIST_ENTRIES, z.undefined(), () =>
    passVault.listEntries(),
  )

  registerValidatedHandler(
    IPC_CHANNELS.PASSVAULT_CREATE_ENTRY,
    z.object({
      title: z.string().trim().min(1).max(255),
      username: z.string().max(255).optional(),
      url: z.string().max(2048).optional(),
      password: z.string().min(1).max(1024),
      notes: z.string().max(10_000).optional(),
      folderId: z.string().uuid().nullable().optional(),
      icon: z.string().max(64).optional(),
    }),
    (input) => passVault.createEntry(input),
  )

  registerValidatedHandler(
    IPC_CHANNELS.PASSVAULT_UPDATE_ENTRY,
    z.object({
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(255).optional(),
      username: z.string().max(255).nullable().optional(),
      url: z.string().max(2048).nullable().optional(),
      password: z.string().min(1).max(1024).optional(),
      notes: z.string().max(10_000).nullable().optional(),
      folderId: z.string().uuid().nullable().optional(),
      icon: z.string().max(64).nullable().optional(),
      favorite: z.boolean().optional(),
    }),
    (input) => passVault.updateEntry(input),
  )

  registerValidatedHandler(
    IPC_CHANNELS.PASSVAULT_DELETE_ENTRY,
    z.object({ id: z.string().uuid() }),
    ({ id }) => {
      passVault.deleteEntry(id)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.PASSVAULT_REVEAL_ENTRY,
    z.object({ id: z.string().uuid() }),
    ({ id }) => passVault.revealEntrySecret(id),
  )

  registerValidatedHandler(
    IPC_CHANNELS.PASSVAULT_COPY_PASSWORD,
    z.object({ id: z.string().uuid() }),
    ({ id }) => {
      passVault.copyPasswordToClipboard(id)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.PASSVAULT_GENERATE_PASSWORD,
    z.object({
      length: z.number().int().min(4).max(256),
      lowercase: z.boolean().optional(),
      uppercase: z.boolean().optional(),
      digits: z.boolean().optional(),
      symbols: z.boolean().optional(),
      excludeAmbiguous: z.boolean().optional(),
    }),
    (options) => ({ password: passVault.generate(options) }),
  )

  registerValidatedHandler(IPC_CHANNELS.PASSVAULT_LIST_FOLDERS, z.undefined(), () =>
    passVault.listFolders(),
  )

  registerValidatedHandler(
    IPC_CHANNELS.PASSVAULT_CREATE_FOLDER,
    z.object({
      name: z.string().trim().min(1).max(255),
      parentId: z.string().uuid().nullable().optional(),
      icon: z.string().max(64).optional(),
    }),
    (input) => passVault.createFolder(input),
  )

  registerValidatedHandler(
    IPC_CHANNELS.PASSVAULT_UPDATE_FOLDER,
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(255).optional(),
      parentId: z.string().uuid().nullable().optional(),
      icon: z.string().max(64).nullable().optional(),
    }),
    (input) => passVault.updateFolder(input),
  )

  registerValidatedHandler(
    IPC_CHANNELS.PASSVAULT_DELETE_FOLDER,
    z.object({ id: z.string().uuid() }),
    ({ id }) => {
      passVault.deleteFolder(id)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.PASSVAULT_REORDER_FOLDERS,
    z.object({ parentId: z.string().uuid().nullable(), ids: z.array(z.string().uuid()).max(1000) }),
    ({ ids }) => {
      passVault.reorderFolders(ids)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.PASSVAULT_REORDER_ENTRIES,
    z.object({ folderId: z.string().uuid().nullable(), ids: z.array(z.string().uuid()).max(1000) }),
    ({ ids }) => {
      passVault.reorderEntries(ids)
      return { ok: true as const }
    },
  )

  registerValidatedHandler(
    IPC_CHANNELS.PASSVAULT_GENERATE_PASSPHRASE,
    z.object({
      words: z.number().int().min(2).max(20),
      separator: z.string().max(8).optional(),
      capitalize: z.boolean().optional(),
      includeNumber: z.boolean().optional(),
    }),
    (options) => ({ password: passVault.generatePassphrase(options) }),
  )

  // redactPayload : le mot de passe maitre (ancien + nouveau) ne doit jamais etre journalise.
  registerValidatedHandler(
    IPC_CHANNELS.PASSVAULT_CHANGE_MASTER,
    z.object({
      oldPassword: z.string().min(1).max(1024),
      newPassword: z.string().min(1).max(1024),
    }),
    ({ oldPassword, newPassword }) => passVault.changeMasterPassword(oldPassword, newPassword),
    { redactPayload: true },
  )

  registerValidatedHandler(IPC_CHANNELS.PASSVAULT_BIOMETRIC_ENABLE, z.undefined(), () =>
    passVault.enableBiometric(),
  )
  registerValidatedHandler(IPC_CHANNELS.PASSVAULT_BIOMETRIC_DISABLE, z.undefined(), () =>
    passVault.disableBiometric(),
  )
  registerValidatedHandler(IPC_CHANNELS.PASSVAULT_BIOMETRIC_UNLOCK, z.undefined(), () =>
    passVault.unlockWithBiometric(),
  )
  registerValidatedHandler(IPC_CHANNELS.PASSVAULT_RECOVERY_ENABLE, z.undefined(), async () => ({
    code: await passVault.enableRecovery(),
  }))
  registerValidatedHandler(IPC_CHANNELS.PASSVAULT_RECOVERY_DISABLE, z.undefined(), () =>
    passVault.disableRecovery(),
  )
  registerValidatedHandler(
    IPC_CHANNELS.PASSVAULT_RECOVERY_UNLOCK,
    z.object({ code: z.string().min(1).max(256) }),
    ({ code }) => passVault.unlockWithRecovery(code),
    { redactPayload: true },
  )
  registerValidatedHandler(
    IPC_CHANNELS.PASSVAULT_EXPORT,
    z.object({ password: z.string().min(1).max(1024) }),
    async ({ password }, event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.SaveDialogOptions = {
        title: 'Exporter la sauvegarde omniPass',
        defaultPath: 'omnipass-sauvegarde.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      }
      const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) {
        return { saved: false as const }
      }
      await writeFile(result.filePath, await passVault.buildExport(password), 'utf8')
      return { saved: true as const }
    },
    { redactPayload: true },
  )
  registerValidatedHandler(
    IPC_CHANNELS.PASSVAULT_IMPORT,
    z.object({ password: z.string().min(1).max(1024) }),
    async ({ password }, event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.OpenDialogOptions = {
        title: 'Importer une sauvegarde omniPass',
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      }
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      const file = result.filePaths[0]
      if (result.canceled || !file) {
        return null
      }
      return passVault.applyImport(await readFile(file, 'utf8'), password)
    },
    { redactPayload: true },
  )
  registerValidatedHandler(IPC_CHANNELS.PASSVAULT_IMPORT_BROWSER, z.undefined(), () => {
    const seen = new Set<string>()
    let imported = 0
    for (const cred of browser.listCredentials()) {
      if (seen.has(cred.origin)) {
        continue
      }
      seen.add(cred.origin)
      const fill = browser.getCredentialForOrigin(cred.origin)
      if (!fill) {
        continue
      }
      let host = cred.origin
      try {
        host = new URL(cred.origin).hostname
      } catch {
        // garde l'origine telle quelle
      }
      passVault.createEntry({
        title: host,
        username: fill.username,
        url: cred.origin,
        password: fill.password,
      })
      imported += 1
    }
    return { imported }
  })
  registerValidatedHandler(
    IPC_CHANNELS.PASSVAULT_FIND_FOR_ORIGIN,
    z.object({ origin: z.string().max(2048) }),
    ({ origin }) => passVault.findForOrigin(origin),
  )

  // Sauvegarde complete de l'app : exporte toute la base dans un fichier chiffre par un mot de
  // passe choisi (cf. AppBackupService). Le mot de passe ne doit jamais etre journalise.
  registerValidatedHandler(
    IPC_CHANNELS.BACKUP_EXPORT,
    z.object({ password: z.string().min(1).max(1024) }),
    async ({ password }, event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.SaveDialogOptions = {
        title: 'Exporter une sauvegarde Omnidesk',
        defaultPath: 'omnidesk-sauvegarde.json',
        filters: [{ name: 'Sauvegarde Omnidesk', extensions: ['json'] }],
      }
      const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) {
        return { saved: false as const }
      }
      await writeFile(result.filePath, await appBackup.buildBackup(password), 'utf8')
      return { saved: true as const }
    },
    { redactPayload: true },
  )

  // Restauration : remplace integralement la base par la sauvegarde, puis redemarre l'app pour
  // repartir d'un etat 100% coherent (coffre, connexions, renderer). Le dechiffrement est fait
  // AVANT tout effet de bord : un mot de passe errone echoue sans rien modifier.
  registerValidatedHandler(
    IPC_CHANNELS.BACKUP_IMPORT,
    z.object({ password: z.string().min(1).max(1024) }),
    async ({ password }, event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.OpenDialogOptions = {
        title: 'Restaurer une sauvegarde Omnidesk',
        properties: ['openFile'],
        filters: [{ name: 'Sauvegarde Omnidesk', extensions: ['json'] }],
      }
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      const file = result.filePaths[0]
      if (result.canceled || !file) {
        return { restored: false as const }
      }

      const decoded = await appBackup.decode(await readFile(file, 'utf8'), password)
      // A partir d'ici on remplace la base : on fige les ecritures concurrentes (synchro, rappels,
      // signalisation) pour qu'aucune ne s'intercale entre la restauration et le redemarrage.
      syncEngine.stop()
      reminderScheduler.stop()
      signalingClient.stop()
      try {
        appBackup.apply(decoded)
        return { restored: true as const }
      } finally {
        // Reussite comme echec (rollback) : les services sont stoppes, on redemarre pour
        // retrouver un etat propre. Le delai laisse la reponse IPC parvenir au renderer.
        setTimeout(() => {
          try {
            databaseClient.close()
          } catch {
            // deja fermee : sans importance avant le redemarrage
          }
          app.relaunch()
          app.exit(0)
        }, 600)
      }
    },
    { redactPayload: true },
  )
}

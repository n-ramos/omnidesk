import type {
  AccountSummary,
  AppBootstrap,
  BrowserBookmark,
  BrowserBookmarkCategory,
  BrowserCredential,
  BrowserCredentialFill,
  BrowserExtension,
  BrowserHistoryEntry,
  BrowserSpace,
  BrowserTab,
  BrowserTabGroup,
  CitySuggestion,
  RssFeed,
  ComposeMailRequest,
  ConnectImapAccountInput,
  ConnectWebpageAccountInput,
  ContactSummary,
  ConversationDetail,
  ConversationFilters,
  ConversationSummary,
  CreateBrowserSpaceInput,
  CreateDraftAccountInput,
  CreateReminderInput,
  HomeLayout,
  HomeWidgetInstance,
  LocalStatus,
  LocalNotification,
  MailAutodiscoverResult,
  MailFolderSummary,
  MessageReactionSummary,
  MessageSummary,
  OmnichatContact,
  OmnichatIdentityState,
  OmniboxSuggestion,
  OmniBrowserSettings,
  CreatePassEntryInput,
  CreatePassFolderInput,
  PassEntrySecret,
  PassEntrySummary,
  PassFolderSummary,
  PassPassphraseGenOptions,
  PassPasswordGenOptions,
  PassVaultState,
  UpdatePassEntryInput,
  UpdatePassFolderInput,
  ProviderDescriptor,
  Reminder,
  SendMessageRequest,
  StartupView,
  TenorGifResult,
  TenorStatus,
  ToggleReactionRequest,
  UpdateBrowserSpaceInput,
  UpdateMessageStateInput,
  UpdateReminderInput,
  WeatherSnapshot,
} from './models'
import type { AppNavShortcutAction } from './shortcuts'
import type {
  AiConnectionTestResult,
  AiSettings,
  AiSettingsPatch,
  AiStatus,
  AiTokenState,
} from './ai'

export const IPC_CHANNELS = {
  APP_GET_BOOTSTRAP: 'app:get-bootstrap',
  APP_SET_BADGE_COUNT: 'app:set-badge-count',
  APP_GET_UPDATE_STATUS: 'app:get-update-status',
  APP_CHECK_UPDATES: 'app:check-updates',
  APP_INSTALL_UPDATE: 'app:install-update',
  APP_GET_CHANGELOG: 'app:get-changelog',
  PROVIDERS_LIST: 'providers:list',
  ACCOUNTS_LIST: 'accounts:list',
  ACCOUNTS_CREATE_DRAFT: 'accounts:create-draft',
  ACCOUNTS_REFRESH: 'accounts:refresh',
  ACCOUNTS_DISCONNECT: 'accounts:disconnect',
  ACCOUNTS_REORDER: 'accounts:reorder',
  IMAP_AUTODISCOVER: 'imap:autodiscover',
  IMAP_TEST: 'imap:test',
  IMAP_CONNECT: 'imap:connect',
  IMAP_LIST_FOLDERS: 'imap:list-folders',
  IMAP_SELECT_FOLDER: 'imap:select-folder',
  IMAP_COMPOSE: 'imap:compose',
  IMAP_MARK_READ: 'imap:mark-read',
  IMAP_LOAD_MORE: 'imap:load-more',
  IMAP_DELETE_CONVERSATION: 'imap:delete-conversation',
  IMAP_MOVE_CONVERSATION: 'imap:move-conversation',
  WEBPAGE_CONNECT: 'webpage:connect',
  WEBPAGE_SET_KEEP_ALIVE: 'webpage:set-keep-alive',
  WEBPAGE_SET_FAVICON: 'webpage:set-favicon',
  WEBPAGE_SET_AD_BLOCK: 'webpage:set-ad-block',
  WEBPAGE_NOTIFY: 'webpage:notify',
  WEBVIEW_SEND_MEDIA_KEY: 'webview:send-media-key',
  CONVERSATIONS_LIST: 'conversations:list',
  CONVERSATIONS_GET: 'conversations:get',
  CONVERSATIONS_FOCUS: 'conversations:focus',
  CONVERSATIONS_MARK_READ: 'conversations:mark-read',
  CONVERSATIONS_LOOKUP_EXTERNAL: 'conversations:lookup-external',
  CONVERSATIONS_OPEN_DIRECT: 'conversations:open-direct',
  CONTACTS_LIST: 'contacts:list',
  MESSAGES_UPDATE_STATE: 'messages:update-state',
  MESSAGES_SEND: 'messages:send',
  MESSAGES_TOGGLE_REACTION: 'messages:toggle-reaction',
  ATTACHMENTS_OPEN: 'attachments:open',
  OMNICHAT_GET_CALL_TOKEN: 'omnichat:get-call-token',
  OMNICHAT_START_RECORDING: 'omnichat:start-recording',
  OMNICHAT_STOP_RECORDING: 'omnichat:stop-recording',
  OMNICHAT_WATCH_GROUP: 'omnichat:watch-group',
  OMNICHAT_SET_GROUP_CALL: 'omnichat:set-group-call',
  OMNICHAT_AVAILABILITY: 'omnichat:availability',
  OMNICHAT_GET_IDENTITY: 'omnichat:get-identity',
  OMNICHAT_SET_IDENTITY: 'omnichat:set-identity',
  OMNICHAT_ADD_CONTACT: 'omnichat:add-contact',
  OMNICHAT_REMOVE_CONTACT: 'omnichat:remove-contact',
  OMNICHAT_LIST_CONTACTS: 'omnichat:list-contacts',
  OMNICHAT_OPEN_DM: 'omnichat:open-dm',
  OMNICHAT_DM_PEER: 'omnichat:dm-peer',
  OMNICHAT_CREATE_GROUP: 'omnichat:create-group',
  OMNICHAT_UPDATE_GROUP: 'omnichat:update-group',
  OMNICHAT_SEND: 'omnichat:send',
  OMNICHAT_TYPING: 'omnichat:typing',
  OMNICHAT_SEND_RECEIPT: 'omnichat:send-receipt',
  OMNICHAT_CALL_INVITE: 'omnichat:call-invite',
  OMNICHAT_CALL_ACCEPT: 'omnichat:call-accept',
  OMNICHAT_CALL_DECLINE: 'omnichat:call-decline',
  OMNICHAT_CALL_CANCEL: 'omnichat:call-cancel',
  OMNICHAT_JOIN_GROUP: 'omnichat:join-group',
  OMNICHAT_LEAVE_GROUP: 'omnichat:leave-group',
  OMNICHAT_GROUP_CODE: 'omnichat:group-code',
  TENOR_STATUS: 'tenor:status',
  TENOR_FEATURED: 'tenor:featured',
  TENOR_SEARCH: 'tenor:search',
  SETTINGS_GET_LOCAL_STATUS: 'settings:get-local-status',
  SETTINGS_GET_STARTUP_VIEW: 'settings:get-startup-view',
  SETTINGS_SET_STARTUP_VIEW: 'settings:set-startup-view',
  SETTINGS_GET_ACCENT_COLOR: 'settings:get-accent-color',
  SETTINGS_SET_ACCENT_COLOR: 'settings:set-accent-color',
  SETTINGS_GET_BASE_COLOR: 'settings:get-base-color',
  SETTINGS_SET_BASE_COLOR: 'settings:set-base-color',
  SETTINGS_GET_NAV_SHORTCUTS: 'settings:get-nav-shortcuts',
  SETTINGS_SET_NAV_SHORTCUTS: 'settings:set-nav-shortcuts',
  HOME_GET_LAYOUT: 'home:get-layout',
  HOME_SAVE_LAYOUT: 'home:save-layout',
  WEATHER_FETCH: 'weather:fetch',
  WEATHER_SEARCH_CITIES: 'weather:search-cities',
  RSS_FETCH: 'rss:fetch',
  NOTIFICATIONS_LIST: 'notifications:list',
  NOTIFICATIONS_MARK_READ: 'notifications:mark-read',
  NOTIFICATIONS_MARK_READ_FOR_CONVERSATION: 'notifications:mark-read-for-conversation',
  NOTIFICATIONS_CLEAR_ALL: 'notifications:clear-all',
  REMINDERS_LIST: 'reminders:list',
  REMINDERS_CREATE: 'reminders:create',
  REMINDERS_UPDATE: 'reminders:update',
  REMINDERS_DELETE: 'reminders:delete',
  WINDOW_CLOSE: 'window:close',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_MINIMIZE: 'window:minimize',
  SHELL_OPEN_EXTERNAL: 'shell:open-external',
  OMNIBROWSER_SPACES_LIST: 'omnibrowser:spaces-list',
  OMNIBROWSER_SPACES_CREATE: 'omnibrowser:spaces-create',
  OMNIBROWSER_SPACES_UPDATE: 'omnibrowser:spaces-update',
  OMNIBROWSER_SPACES_DELETE: 'omnibrowser:spaces-delete',
  OMNIBROWSER_SPACES_REORDER: 'omnibrowser:spaces-reorder',
  OMNIBROWSER_SPACES_SET_ACTIVE: 'omnibrowser:spaces-set-active',
  OMNIBROWSER_SPACES_SET_AD_BLOCK: 'omnibrowser:spaces-set-ad-block',
  OMNIBROWSER_CATEGORIES_LIST: 'omnibrowser:categories-list',
  OMNIBROWSER_CATEGORIES_CREATE: 'omnibrowser:categories-create',
  OMNIBROWSER_CATEGORIES_UPDATE: 'omnibrowser:categories-update',
  OMNIBROWSER_CATEGORIES_DELETE: 'omnibrowser:categories-delete',
  OMNIBROWSER_CATEGORIES_REORDER: 'omnibrowser:categories-reorder',
  OMNIBROWSER_BOOKMARKS_LIST: 'omnibrowser:bookmarks-list',
  OMNIBROWSER_BOOKMARKS_CREATE: 'omnibrowser:bookmarks-create',
  OMNIBROWSER_BOOKMARKS_UPDATE: 'omnibrowser:bookmarks-update',
  OMNIBROWSER_BOOKMARKS_DELETE: 'omnibrowser:bookmarks-delete',
  OMNIBROWSER_BOOKMARKS_REORDER: 'omnibrowser:bookmarks-reorder',
  OMNIBROWSER_HISTORY_RECORD: 'omnibrowser:history-record',
  OMNIBROWSER_HISTORY_LIST: 'omnibrowser:history-list',
  OMNIBROWSER_HISTORY_SEARCH: 'omnibrowser:history-search',
  OMNIBROWSER_HISTORY_DELETE: 'omnibrowser:history-delete',
  OMNIBROWSER_HISTORY_CLEAR: 'omnibrowser:history-clear',
  OMNIBROWSER_TABS_LIST: 'omnibrowser:tabs-list',
  OMNIBROWSER_TABS_UPSERT: 'omnibrowser:tabs-upsert',
  OMNIBROWSER_TABS_SET_ACTIVE: 'omnibrowser:tabs-set-active',
  OMNIBROWSER_TABS_CLOSE: 'omnibrowser:tabs-close',
  OMNIBROWSER_TABS_REORDER: 'omnibrowser:tabs-reorder',
  OMNIBROWSER_TABS_SET_GROUP: 'omnibrowser:tabs-set-group',
  OMNIBROWSER_TABS_SET_TITLE: 'omnibrowser:tabs-set-title',
  OMNIBROWSER_OMNIBOX_SUGGEST: 'omnibrowser:omnibox-suggest',
  OMNIBROWSER_TAB_GROUPS_LIST: 'omnibrowser:tab-groups-list',
  OMNIBROWSER_TAB_GROUPS_CREATE: 'omnibrowser:tab-groups-create',
  OMNIBROWSER_TAB_GROUPS_UPDATE: 'omnibrowser:tab-groups-update',
  OMNIBROWSER_TAB_GROUPS_DELETE: 'omnibrowser:tab-groups-delete',
  OMNIBROWSER_TAB_GROUPS_REORDER: 'omnibrowser:tab-groups-reorder',
  OMNIBROWSER_SETTINGS_GET: 'omnibrowser:settings-get',
  OMNIBROWSER_SETTINGS_UPDATE: 'omnibrowser:settings-update',
  OMNIBROWSER_SHORTCUTS_CAPTURE: 'omnibrowser:shortcuts-capture',
  OMNIBROWSER_EXTENSIONS_LIST: 'omnibrowser:extensions-list',
  OMNIBROWSER_EXTENSIONS_ADD: 'omnibrowser:extensions-add',
  OMNIBROWSER_EXTENSIONS_SET_ENABLED: 'omnibrowser:extensions-set-enabled',
  OMNIBROWSER_EXTENSIONS_REMOVE: 'omnibrowser:extensions-remove',
  OMNIBROWSER_DEVTOOLS_ATTACH: 'omnibrowser:devtools-attach',
  OMNIBROWSER_DEVTOOLS_SET_BOUNDS: 'omnibrowser:devtools-set-bounds',
  OMNIBROWSER_DEVTOOLS_DETACH: 'omnibrowser:devtools-detach',
  OMNIBROWSER_DEVTOOLS_INSPECT: 'omnibrowser:devtools-inspect',
  OMNIBROWSER_CREDENTIALS_SAVE: 'omnibrowser:credentials-save',
  OMNIBROWSER_CREDENTIALS_FOR_ORIGIN: 'omnibrowser:credentials-for-origin',
  OMNIBROWSER_CREDENTIALS_LIST: 'omnibrowser:credentials-list',
  OMNIBROWSER_CREDENTIALS_DELETE: 'omnibrowser:credentials-delete',
  PASSVAULT_GET_STATUS: 'passvault:get-status',
  PASSVAULT_CREATE: 'passvault:create-vault',
  PASSVAULT_UNLOCK: 'passvault:unlock',
  PASSVAULT_LOCK: 'passvault:lock',
  PASSVAULT_LIST_ENTRIES: 'passvault:list-entries',
  PASSVAULT_CREATE_ENTRY: 'passvault:create-entry',
  PASSVAULT_UPDATE_ENTRY: 'passvault:update-entry',
  PASSVAULT_DELETE_ENTRY: 'passvault:delete-entry',
  PASSVAULT_REVEAL_ENTRY: 'passvault:reveal-entry',
  PASSVAULT_COPY_PASSWORD: 'passvault:copy-password',
  PASSVAULT_GENERATE_PASSWORD: 'passvault:generate-password',
  PASSVAULT_LIST_FOLDERS: 'passvault:list-folders',
  PASSVAULT_CREATE_FOLDER: 'passvault:create-folder',
  PASSVAULT_UPDATE_FOLDER: 'passvault:update-folder',
  PASSVAULT_DELETE_FOLDER: 'passvault:delete-folder',
  PASSVAULT_REORDER_FOLDERS: 'passvault:reorder-folders',
  PASSVAULT_REORDER_ENTRIES: 'passvault:reorder-entries',
  PASSVAULT_GENERATE_PASSPHRASE: 'passvault:generate-passphrase',
  PASSVAULT_CHANGE_MASTER: 'passvault:change-master',
  PASSVAULT_BIOMETRIC_ENABLE: 'passvault:biometric-enable',
  PASSVAULT_BIOMETRIC_DISABLE: 'passvault:biometric-disable',
  PASSVAULT_BIOMETRIC_UNLOCK: 'passvault:biometric-unlock',
  PASSVAULT_RECOVERY_ENABLE: 'passvault:recovery-enable',
  PASSVAULT_RECOVERY_DISABLE: 'passvault:recovery-disable',
  PASSVAULT_RECOVERY_UNLOCK: 'passvault:recovery-unlock',
  PASSVAULT_EXPORT: 'passvault:export',
  PASSVAULT_IMPORT: 'passvault:import',
  PASSVAULT_IMPORT_BROWSER: 'passvault:import-browser',
  PASSVAULT_FIND_FOR_ORIGIN: 'passvault:find-for-origin',
  BACKUP_EXPORT: 'backup:export',
  BACKUP_IMPORT: 'backup:import',
  AI_GET_SETTINGS: 'ai:get-settings',
  AI_SET_SETTINGS: 'ai:set-settings',
  AI_SET_TOKEN: 'ai:set-token',
  AI_CLEAR_TOKEN: 'ai:clear-token',
  AI_TEST_CONNECTION: 'ai:test-connection',
  AI_CHAT_SEND: 'ai:chat-send',
  AI_CHAT_CANCEL: 'ai:chat-cancel',
  AI_CONFIRM: 'ai:confirm',
  AI_TRANSCRIBE: 'ai:transcribe',
} as const

export const PRELOAD_EVENTS = {
  SYNC_UPDATED: 'sync:updated',
  REMINDER_FIRED: 'reminder:fired',
  NOTIFICATION_CREATED: 'notification:created',
  OMNIBROWSER_OPEN_TAB: 'omnibrowser:open-tab',
  OMNIBROWSER_SHORTCUT: 'omnibrowser:shortcut',
  OMNIBROWSER_INSPECT: 'omnibrowser:inspect',
  OMNICHAT_CONNECTION: 'omnichat:connection',
  OMNICHAT_MESSAGE: 'omnichat:message',
  OMNICHAT_PRESENCE: 'omnichat:presence',
  OMNICHAT_GROUP: 'omnichat:group',
  OMNICHAT_TYPING_IN: 'omnichat:typing-in',
  OMNICHAT_RECEIPT_IN: 'omnichat:receipt-in',
  OMNICHAT_CALL_RING: 'omnichat:call-ring',
  OMNICHAT_CALL_STATE: 'omnichat:call-state',
  OMNICHAT_REACTION: 'omnichat:reaction',
  OMNICHAT_CALL_ACTIVE: 'omnichat:call-active',
  APP_NAV_SHORTCUT: 'app:nav-shortcut',
  PASSVAULT_LOCKED: 'passvault:locked',
  UPDATE_STATUS: 'update:status',
  AI_CHUNK: 'ai:chunk',
  AI_DONE: 'ai:done',
  AI_ERROR: 'ai:error',
  AI_TOOL_START: 'ai:tool-start',
  AI_TOOL_END: 'ai:tool-end',
  AI_CONFIRM_REQUEST: 'ai:confirm-request',
  HOME_UPDATED: 'home:updated',
} as const

// Source unique des actions de raccourci : voir shortcuts.ts (re-export pour
// compatibilite avec les imports existants depuis '@shared/ipc').
export type { OmniBrowserShortcutAction, AppNavShortcutAction } from './shortcuts'

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

export interface IpcRequestMap {
  [IPC_CHANNELS.APP_GET_BOOTSTRAP]: undefined
  [IPC_CHANNELS.APP_SET_BADGE_COUNT]: { count: number }
  [IPC_CHANNELS.APP_GET_UPDATE_STATUS]: undefined
  [IPC_CHANNELS.APP_CHECK_UPDATES]: undefined
  [IPC_CHANNELS.APP_INSTALL_UPDATE]: undefined
  [IPC_CHANNELS.APP_GET_CHANGELOG]: undefined
  [IPC_CHANNELS.PROVIDERS_LIST]: undefined
  [IPC_CHANNELS.ACCOUNTS_LIST]: undefined
  [IPC_CHANNELS.ACCOUNTS_CREATE_DRAFT]: CreateDraftAccountInput
  [IPC_CHANNELS.ACCOUNTS_REFRESH]: { accountId: string }
  [IPC_CHANNELS.ACCOUNTS_DISCONNECT]: { accountId: string }
  [IPC_CHANNELS.ACCOUNTS_REORDER]: { ids: string[] }
  [IPC_CHANNELS.IMAP_AUTODISCOVER]: { email: string }
  [IPC_CHANNELS.IMAP_TEST]: {
    password: string
    imap: ConnectImapAccountInput['imap']
    smtp: ConnectImapAccountInput['smtp']
  }
  [IPC_CHANNELS.IMAP_CONNECT]: ConnectImapAccountInput
  [IPC_CHANNELS.IMAP_LIST_FOLDERS]: { accountId: string }
  [IPC_CHANNELS.IMAP_SELECT_FOLDER]: { accountId: string; folderPath: string }
  [IPC_CHANNELS.IMAP_COMPOSE]: ComposeMailRequest
  [IPC_CHANNELS.IMAP_MARK_READ]: { conversationId: string; read: boolean }
  [IPC_CHANNELS.IMAP_LOAD_MORE]: { accountId: string }
  [IPC_CHANNELS.IMAP_DELETE_CONVERSATION]: { conversationId: string }
  [IPC_CHANNELS.IMAP_MOVE_CONVERSATION]: { conversationId: string; folderPath: string }
  [IPC_CHANNELS.WEBPAGE_CONNECT]: ConnectWebpageAccountInput
  [IPC_CHANNELS.WEBPAGE_SET_KEEP_ALIVE]: { accountId: string; keepAlive: boolean }
  [IPC_CHANNELS.WEBPAGE_SET_FAVICON]: { accountId: string; faviconUrl: string | null }
  [IPC_CHANNELS.WEBPAGE_SET_AD_BLOCK]: { accountId: string; enabled: boolean }
  [IPC_CHANNELS.WEBPAGE_NOTIFY]: { accountId: string; title: string; body?: string }
  [IPC_CHANNELS.WEBVIEW_SEND_MEDIA_KEY]: {
    webContentsId: number
    key: 'play-pause' | 'next' | 'previous' | 'stop'
  }
  [IPC_CHANNELS.CONVERSATIONS_LIST]: ConversationFilters | undefined
  [IPC_CHANNELS.CONVERSATIONS_GET]: { conversationId: string }
  [IPC_CHANNELS.CONVERSATIONS_FOCUS]: { conversationId: string | null }
  [IPC_CHANNELS.CONVERSATIONS_MARK_READ]: { conversationId: string }
  [IPC_CHANNELS.CONVERSATIONS_LOOKUP_EXTERNAL]: {
    accountId: string
    externalConversationId: string
  }
  [IPC_CHANNELS.CONVERSATIONS_OPEN_DIRECT]: { accountId: string; contactExternalId: string }
  [IPC_CHANNELS.CONTACTS_LIST]: { accountId: string }
  [IPC_CHANNELS.MESSAGES_UPDATE_STATE]: UpdateMessageStateInput
  [IPC_CHANNELS.MESSAGES_SEND]: SendMessageRequest
  [IPC_CHANNELS.MESSAGES_TOGGLE_REACTION]: ToggleReactionRequest
  [IPC_CHANNELS.ATTACHMENTS_OPEN]: { attachmentId: string }
  [IPC_CHANNELS.OMNICHAT_GET_CALL_TOKEN]: { callId: string; room: string }
  [IPC_CHANNELS.OMNICHAT_START_RECORDING]: { callId: string; room: string }
  [IPC_CHANNELS.OMNICHAT_STOP_RECORDING]: { egressId: string }
  [IPC_CHANNELS.OMNICHAT_WATCH_GROUP]: { conversationId: string | null }
  [IPC_CHANNELS.OMNICHAT_SET_GROUP_CALL]: {
    conversationId: string
    callId: string
    room: string
    active: boolean
  }
  [IPC_CHANNELS.OMNICHAT_AVAILABILITY]: undefined
  [IPC_CHANNELS.OMNICHAT_GET_IDENTITY]: undefined
  [IPC_CHANNELS.OMNICHAT_SET_IDENTITY]: { pseudo: string }
  [IPC_CHANNELS.OMNICHAT_ADD_CONTACT]: { pseudo: string; id: string }
  [IPC_CHANNELS.OMNICHAT_REMOVE_CONTACT]: { id: string }
  [IPC_CHANNELS.OMNICHAT_LIST_CONTACTS]: undefined
  [IPC_CHANNELS.OMNICHAT_OPEN_DM]: { peerId: string }
  [IPC_CHANNELS.OMNICHAT_DM_PEER]: { conversationId: string }
  [IPC_CHANNELS.OMNICHAT_CREATE_GROUP]: { title: string; members: string[] }
  [IPC_CHANNELS.OMNICHAT_UPDATE_GROUP]: {
    conversationId: string
    title?: string
    addMembers?: string[]
    removeMembers?: string[]
  }
  [IPC_CHANNELS.OMNICHAT_SEND]: { conversationId: string; body: string }
  [IPC_CHANNELS.OMNICHAT_TYPING]: { conversationId: string; state: 'start' | 'stop' }
  [IPC_CHANNELS.OMNICHAT_SEND_RECEIPT]: {
    conversationId: string
    serverMsgId: string
    state: 'delivered' | 'read'
  }
  [IPC_CHANNELS.OMNICHAT_CALL_INVITE]: {
    callId: string
    room: string
    userId: string
    media: 'audio' | 'video'
  }
  [IPC_CHANNELS.OMNICHAT_CALL_ACCEPT]: { from: string; callId: string }
  [IPC_CHANNELS.OMNICHAT_CALL_DECLINE]: {
    from: string
    callId: string
    reason?: 'busy' | 'declined' | 'timeout' | 'unavailable'
  }
  [IPC_CHANNELS.OMNICHAT_CALL_CANCEL]: { from: string; callId: string }
  [IPC_CHANNELS.OMNICHAT_JOIN_GROUP]: { groupId: string }
  [IPC_CHANNELS.OMNICHAT_LEAVE_GROUP]: { conversationId: string }
  [IPC_CHANNELS.OMNICHAT_GROUP_CODE]: { conversationId: string }
  [IPC_CHANNELS.TENOR_STATUS]: undefined
  [IPC_CHANNELS.TENOR_FEATURED]: { limit?: number } | undefined
  [IPC_CHANNELS.TENOR_SEARCH]: { query: string; limit?: number }
  [IPC_CHANNELS.SETTINGS_GET_LOCAL_STATUS]: undefined
  [IPC_CHANNELS.SETTINGS_GET_STARTUP_VIEW]: undefined
  [IPC_CHANNELS.SETTINGS_SET_STARTUP_VIEW]: { view: StartupView }
  [IPC_CHANNELS.SETTINGS_GET_ACCENT_COLOR]: undefined
  [IPC_CHANNELS.SETTINGS_SET_ACCENT_COLOR]: { color: string }
  [IPC_CHANNELS.SETTINGS_GET_BASE_COLOR]: undefined
  [IPC_CHANNELS.SETTINGS_SET_BASE_COLOR]: { color: string }
  [IPC_CHANNELS.SETTINGS_GET_NAV_SHORTCUTS]: undefined
  [IPC_CHANNELS.SETTINGS_SET_NAV_SHORTCUTS]: {
    shortcuts: Partial<Record<AppNavShortcutAction, string>>
  }
  [IPC_CHANNELS.HOME_GET_LAYOUT]: undefined
  [IPC_CHANNELS.HOME_SAVE_LAYOUT]: { widgets: HomeWidgetInstance[] }
  [IPC_CHANNELS.WEATHER_FETCH]: {
    query?: string
    latitude?: number
    longitude?: number
    label?: string
  }
  [IPC_CHANNELS.WEATHER_SEARCH_CITIES]: { query: string }
  [IPC_CHANNELS.RSS_FETCH]: { url: string; limit?: number }
  [IPC_CHANNELS.NOTIFICATIONS_LIST]: { unreadOnly?: boolean } | undefined
  [IPC_CHANNELS.NOTIFICATIONS_MARK_READ]: { notificationId: string }
  [IPC_CHANNELS.NOTIFICATIONS_MARK_READ_FOR_CONVERSATION]: { conversationId: string }
  [IPC_CHANNELS.NOTIFICATIONS_CLEAR_ALL]: undefined
  [IPC_CHANNELS.REMINDERS_LIST]: undefined
  [IPC_CHANNELS.REMINDERS_CREATE]: CreateReminderInput
  [IPC_CHANNELS.REMINDERS_UPDATE]: UpdateReminderInput
  [IPC_CHANNELS.REMINDERS_DELETE]: { id: string }
  [IPC_CHANNELS.WINDOW_CLOSE]: undefined
  [IPC_CHANNELS.WINDOW_MAXIMIZE]: undefined
  [IPC_CHANNELS.WINDOW_MINIMIZE]: undefined
  [IPC_CHANNELS.SHELL_OPEN_EXTERNAL]: { url: string }
  [IPC_CHANNELS.OMNIBROWSER_SPACES_LIST]: undefined
  [IPC_CHANNELS.OMNIBROWSER_SPACES_CREATE]: CreateBrowserSpaceInput
  [IPC_CHANNELS.OMNIBROWSER_SPACES_UPDATE]: UpdateBrowserSpaceInput
  [IPC_CHANNELS.OMNIBROWSER_SPACES_DELETE]: { id: string }
  [IPC_CHANNELS.OMNIBROWSER_SPACES_REORDER]: { ids: string[] }
  [IPC_CHANNELS.OMNIBROWSER_SPACES_SET_ACTIVE]: { id: string }
  [IPC_CHANNELS.OMNIBROWSER_SPACES_SET_AD_BLOCK]: { spaceId: string; enabled: boolean }
  [IPC_CHANNELS.OMNIBROWSER_CATEGORIES_LIST]: { spaceId: string }
  [IPC_CHANNELS.OMNIBROWSER_CATEGORIES_CREATE]: { spaceId: string; name: string }
  [IPC_CHANNELS.OMNIBROWSER_CATEGORIES_UPDATE]: { id: string; name: string }
  [IPC_CHANNELS.OMNIBROWSER_CATEGORIES_DELETE]: { id: string }
  [IPC_CHANNELS.OMNIBROWSER_CATEGORIES_REORDER]: { spaceId: string; ids: string[] }
  [IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_LIST]: { spaceId: string }
  [IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_CREATE]: {
    spaceId: string
    categoryId?: string | null
    title: string
    url: string
    faviconUrl?: string
  }
  [IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_UPDATE]: {
    id: string
    title?: string
    url?: string
    faviconUrl?: string
    categoryId?: string | null
  }
  [IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_DELETE]: { id: string }
  [IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_REORDER]: { spaceId: string; ids: string[] }
  [IPC_CHANNELS.OMNIBROWSER_HISTORY_RECORD]: {
    spaceId: string
    url: string
    title?: string
    faviconUrl?: string
  }
  [IPC_CHANNELS.OMNIBROWSER_HISTORY_LIST]: { spaceId: string; limit?: number; before?: string }
  [IPC_CHANNELS.OMNIBROWSER_HISTORY_SEARCH]: { spaceId: string; query: string; limit?: number }
  [IPC_CHANNELS.OMNIBROWSER_HISTORY_DELETE]: { id: string }
  [IPC_CHANNELS.OMNIBROWSER_HISTORY_CLEAR]: { spaceId: string }
  [IPC_CHANNELS.OMNIBROWSER_TABS_LIST]: { spaceId: string }
  [IPC_CHANNELS.OMNIBROWSER_TABS_UPSERT]: {
    id?: string
    spaceId: string
    url: string
    title?: string
    customTitle?: string | null
    faviconUrl?: string
    isPinned?: boolean
    isActive?: boolean
  }
  [IPC_CHANNELS.OMNIBROWSER_TABS_SET_ACTIVE]: { spaceId: string; tabId: string }
  [IPC_CHANNELS.OMNIBROWSER_TABS_CLOSE]: { id: string }
  [IPC_CHANNELS.OMNIBROWSER_TABS_REORDER]: { spaceId: string; ids: string[] }
  [IPC_CHANNELS.OMNIBROWSER_TABS_SET_GROUP]: { tabId: string; groupId: string | null }
  [IPC_CHANNELS.OMNIBROWSER_TABS_SET_TITLE]: { tabId: string; title: string | null }
  [IPC_CHANNELS.OMNIBROWSER_OMNIBOX_SUGGEST]: { spaceId: string; query: string; limit?: number }
  [IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_LIST]: { spaceId: string }
  [IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_CREATE]: { spaceId: string; name: string; color?: string }
  [IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_UPDATE]: {
    id: string
    name?: string
    color?: string
    isCollapsed?: boolean
  }
  [IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_DELETE]: { id: string }
  [IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_REORDER]: { spaceId: string; ids: string[] }
  [IPC_CHANNELS.OMNIBROWSER_SETTINGS_GET]: undefined
  [IPC_CHANNELS.OMNIBROWSER_SETTINGS_UPDATE]: Partial<OmniBrowserSettings>
  [IPC_CHANNELS.OMNIBROWSER_SHORTCUTS_CAPTURE]: { capturing: boolean }
  [IPC_CHANNELS.OMNIBROWSER_EXTENSIONS_LIST]: undefined
  [IPC_CHANNELS.OMNIBROWSER_EXTENSIONS_ADD]: undefined
  [IPC_CHANNELS.OMNIBROWSER_EXTENSIONS_SET_ENABLED]: { id: string; enabled: boolean }
  [IPC_CHANNELS.OMNIBROWSER_EXTENSIONS_REMOVE]: { id: string }
  [IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_ATTACH]: {
    guestWebContentsId: number
    bounds: { x: number; y: number; width: number; height: number }
    inspectX?: number
    inspectY?: number
  }
  [IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_SET_BOUNDS]: {
    bounds: { x: number; y: number; width: number; height: number }
    visible: boolean
  }
  [IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_DETACH]: { guestWebContentsId: number }
  [IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_INSPECT]: {
    webContentsId: number
    x: number
    y: number
  }
  [IPC_CHANNELS.OMNIBROWSER_CREDENTIALS_SAVE]: {
    origin: string
    username: string
    password: string
  }
  [IPC_CHANNELS.OMNIBROWSER_CREDENTIALS_FOR_ORIGIN]: { origin: string }
  [IPC_CHANNELS.OMNIBROWSER_CREDENTIALS_LIST]: undefined
  [IPC_CHANNELS.OMNIBROWSER_CREDENTIALS_DELETE]: { id: string }
  [IPC_CHANNELS.PASSVAULT_GET_STATUS]: undefined
  [IPC_CHANNELS.PASSVAULT_CREATE]: { masterPassword: string }
  [IPC_CHANNELS.PASSVAULT_UNLOCK]: { masterPassword: string }
  [IPC_CHANNELS.PASSVAULT_LOCK]: undefined
  [IPC_CHANNELS.PASSVAULT_LIST_ENTRIES]: undefined
  [IPC_CHANNELS.PASSVAULT_CREATE_ENTRY]: CreatePassEntryInput
  [IPC_CHANNELS.PASSVAULT_UPDATE_ENTRY]: UpdatePassEntryInput
  [IPC_CHANNELS.PASSVAULT_DELETE_ENTRY]: { id: string }
  [IPC_CHANNELS.PASSVAULT_REVEAL_ENTRY]: { id: string }
  [IPC_CHANNELS.PASSVAULT_COPY_PASSWORD]: { id: string }
  [IPC_CHANNELS.PASSVAULT_GENERATE_PASSWORD]: PassPasswordGenOptions
  [IPC_CHANNELS.PASSVAULT_LIST_FOLDERS]: undefined
  [IPC_CHANNELS.PASSVAULT_CREATE_FOLDER]: CreatePassFolderInput
  [IPC_CHANNELS.PASSVAULT_UPDATE_FOLDER]: UpdatePassFolderInput
  [IPC_CHANNELS.PASSVAULT_DELETE_FOLDER]: { id: string }
  [IPC_CHANNELS.PASSVAULT_REORDER_FOLDERS]: { parentId: string | null; ids: string[] }
  [IPC_CHANNELS.PASSVAULT_REORDER_ENTRIES]: { folderId: string | null; ids: string[] }
  [IPC_CHANNELS.PASSVAULT_GENERATE_PASSPHRASE]: PassPassphraseGenOptions
  [IPC_CHANNELS.PASSVAULT_CHANGE_MASTER]: { oldPassword: string; newPassword: string }
  [IPC_CHANNELS.PASSVAULT_BIOMETRIC_ENABLE]: undefined
  [IPC_CHANNELS.PASSVAULT_BIOMETRIC_DISABLE]: undefined
  [IPC_CHANNELS.PASSVAULT_BIOMETRIC_UNLOCK]: undefined
  [IPC_CHANNELS.PASSVAULT_RECOVERY_ENABLE]: undefined
  [IPC_CHANNELS.PASSVAULT_RECOVERY_DISABLE]: undefined
  [IPC_CHANNELS.PASSVAULT_RECOVERY_UNLOCK]: { code: string }
  [IPC_CHANNELS.PASSVAULT_EXPORT]: { password: string }
  [IPC_CHANNELS.PASSVAULT_IMPORT]: { password: string }
  [IPC_CHANNELS.PASSVAULT_IMPORT_BROWSER]: undefined
  [IPC_CHANNELS.PASSVAULT_FIND_FOR_ORIGIN]: { origin: string }
  [IPC_CHANNELS.BACKUP_EXPORT]: { password: string }
  [IPC_CHANNELS.BACKUP_IMPORT]: { password: string }
  [IPC_CHANNELS.AI_GET_SETTINGS]: undefined
  [IPC_CHANNELS.AI_SET_SETTINGS]: AiSettingsPatch
  [IPC_CHANNELS.AI_SET_TOKEN]: { token: string }
  [IPC_CHANNELS.AI_CLEAR_TOKEN]: undefined
  [IPC_CHANNELS.AI_TEST_CONNECTION]: undefined
  [IPC_CHANNELS.AI_CHAT_SEND]: { conversationId: string; message: string }
  [IPC_CHANNELS.AI_CHAT_CANCEL]: { conversationId: string }
  [IPC_CHANNELS.AI_CONFIRM]: {
    requestId: string
    approved: boolean
    editedArguments?: Record<string, unknown>
  }
  [IPC_CHANNELS.AI_TRANSCRIBE]: { audio: Uint8Array; mimeType: string }
}

export interface IpcResponseMap {
  [IPC_CHANNELS.APP_GET_BOOTSTRAP]: AppBootstrap
  [IPC_CHANNELS.APP_SET_BADGE_COUNT]: { ok: true }
  [IPC_CHANNELS.APP_GET_UPDATE_STATUS]: AppUpdateStatus
  [IPC_CHANNELS.APP_CHECK_UPDATES]: { ok: true }
  [IPC_CHANNELS.APP_INSTALL_UPDATE]: { ok: true }
  [IPC_CHANNELS.APP_GET_CHANGELOG]: ChangelogEntry[]
  [IPC_CHANNELS.PROVIDERS_LIST]: ProviderDescriptor[]
  [IPC_CHANNELS.ACCOUNTS_LIST]: AccountSummary[]
  [IPC_CHANNELS.ACCOUNTS_CREATE_DRAFT]: AccountSummary
  [IPC_CHANNELS.ACCOUNTS_REFRESH]: { conversations: number; messages: number }
  [IPC_CHANNELS.ACCOUNTS_DISCONNECT]: { ok: true }
  [IPC_CHANNELS.ACCOUNTS_REORDER]: AccountSummary[]
  [IPC_CHANNELS.IMAP_AUTODISCOVER]: MailAutodiscoverResult
  [IPC_CHANNELS.IMAP_TEST]: { ok: true }
  [IPC_CHANNELS.IMAP_CONNECT]: AccountSummary
  [IPC_CHANNELS.IMAP_LIST_FOLDERS]: MailFolderSummary[]
  [IPC_CHANNELS.IMAP_SELECT_FOLDER]: { ok: true }
  [IPC_CHANNELS.IMAP_COMPOSE]: { ok: true; externalMessageId: string }
  [IPC_CHANNELS.IMAP_MARK_READ]: { ok: true }
  [IPC_CHANNELS.IMAP_LOAD_MORE]: { ok: true; inserted: number }
  [IPC_CHANNELS.IMAP_DELETE_CONVERSATION]: { ok: true }
  [IPC_CHANNELS.IMAP_MOVE_CONVERSATION]: { ok: true }
  [IPC_CHANNELS.WEBPAGE_CONNECT]: AccountSummary
  [IPC_CHANNELS.WEBPAGE_SET_KEEP_ALIVE]: AccountSummary
  [IPC_CHANNELS.WEBPAGE_SET_FAVICON]: AccountSummary
  [IPC_CHANNELS.WEBPAGE_SET_AD_BLOCK]: AccountSummary
  [IPC_CHANNELS.WEBPAGE_NOTIFY]: LocalNotification
  [IPC_CHANNELS.WEBVIEW_SEND_MEDIA_KEY]: { ok: true }
  [IPC_CHANNELS.CONVERSATIONS_LIST]: ConversationSummary[]
  [IPC_CHANNELS.CONVERSATIONS_GET]: ConversationDetail | null
  [IPC_CHANNELS.CONVERSATIONS_FOCUS]: { ok: true }
  [IPC_CHANNELS.CONVERSATIONS_MARK_READ]: { ok: true }
  [IPC_CHANNELS.CONVERSATIONS_LOOKUP_EXTERNAL]: { conversationId: string } | null
  [IPC_CHANNELS.CONVERSATIONS_OPEN_DIRECT]: { conversationId: string }
  [IPC_CHANNELS.CONTACTS_LIST]: ContactSummary[]
  [IPC_CHANNELS.MESSAGES_UPDATE_STATE]: MessageSummary | null
  [IPC_CHANNELS.MESSAGES_SEND]: MessageSummary
  [IPC_CHANNELS.MESSAGES_TOGGLE_REACTION]: MessageReactionSummary[]
  [IPC_CHANNELS.ATTACHMENTS_OPEN]: { ok: true; localPath: string }
  [IPC_CHANNELS.OMNICHAT_GET_CALL_TOKEN]: OmnichatTokenResult
  [IPC_CHANNELS.OMNICHAT_START_RECORDING]: { egressId: string }
  [IPC_CHANNELS.OMNICHAT_STOP_RECORDING]: { ok: true }
  [IPC_CHANNELS.OMNICHAT_WATCH_GROUP]: { ok: true }
  [IPC_CHANNELS.OMNICHAT_SET_GROUP_CALL]: { ok: true }
  [IPC_CHANNELS.OMNICHAT_AVAILABILITY]: { available: boolean }
  [IPC_CHANNELS.OMNICHAT_GET_IDENTITY]: OmnichatIdentityState
  [IPC_CHANNELS.OMNICHAT_SET_IDENTITY]: OmnichatIdentityState
  [IPC_CHANNELS.OMNICHAT_ADD_CONTACT]: OmnichatContact
  [IPC_CHANNELS.OMNICHAT_REMOVE_CONTACT]: { ok: true }
  [IPC_CHANNELS.OMNICHAT_LIST_CONTACTS]: OmnichatContact[]
  [IPC_CHANNELS.OMNICHAT_OPEN_DM]: { conversationId: string }
  [IPC_CHANNELS.OMNICHAT_DM_PEER]: { userId: string | null }
  [IPC_CHANNELS.OMNICHAT_CREATE_GROUP]: { conversationId: string }
  [IPC_CHANNELS.OMNICHAT_UPDATE_GROUP]: { ok: true }
  [IPC_CHANNELS.OMNICHAT_SEND]: MessageSummary
  [IPC_CHANNELS.OMNICHAT_TYPING]: { ok: true }
  [IPC_CHANNELS.OMNICHAT_SEND_RECEIPT]: { ok: true }
  [IPC_CHANNELS.OMNICHAT_CALL_INVITE]: { ok: true }
  [IPC_CHANNELS.OMNICHAT_CALL_ACCEPT]: { ok: true }
  [IPC_CHANNELS.OMNICHAT_CALL_DECLINE]: { ok: true }
  [IPC_CHANNELS.OMNICHAT_CALL_CANCEL]: { ok: true }
  [IPC_CHANNELS.OMNICHAT_JOIN_GROUP]: { ok: true }
  [IPC_CHANNELS.OMNICHAT_LEAVE_GROUP]: { ok: true }
  [IPC_CHANNELS.OMNICHAT_GROUP_CODE]: { code: string | null }
  [IPC_CHANNELS.TENOR_STATUS]: TenorStatus
  [IPC_CHANNELS.TENOR_FEATURED]: TenorGifResult[]
  [IPC_CHANNELS.TENOR_SEARCH]: TenorGifResult[]
  [IPC_CHANNELS.SETTINGS_GET_LOCAL_STATUS]: LocalStatus
  [IPC_CHANNELS.SETTINGS_GET_STARTUP_VIEW]: { view: StartupView }
  [IPC_CHANNELS.SETTINGS_SET_STARTUP_VIEW]: { view: StartupView }
  [IPC_CHANNELS.SETTINGS_GET_ACCENT_COLOR]: { color: string }
  [IPC_CHANNELS.SETTINGS_SET_ACCENT_COLOR]: { color: string }
  [IPC_CHANNELS.SETTINGS_GET_BASE_COLOR]: { color: string }
  [IPC_CHANNELS.SETTINGS_SET_BASE_COLOR]: { color: string }
  [IPC_CHANNELS.SETTINGS_GET_NAV_SHORTCUTS]: {
    shortcuts: Partial<Record<AppNavShortcutAction, string>>
  }
  [IPC_CHANNELS.SETTINGS_SET_NAV_SHORTCUTS]: {
    shortcuts: Partial<Record<AppNavShortcutAction, string>>
  }
  [IPC_CHANNELS.HOME_GET_LAYOUT]: HomeLayout
  [IPC_CHANNELS.HOME_SAVE_LAYOUT]: HomeLayout
  [IPC_CHANNELS.WEATHER_FETCH]: WeatherSnapshot
  [IPC_CHANNELS.WEATHER_SEARCH_CITIES]: CitySuggestion[]
  [IPC_CHANNELS.RSS_FETCH]: RssFeed
  [IPC_CHANNELS.NOTIFICATIONS_LIST]: LocalNotification[]
  [IPC_CHANNELS.NOTIFICATIONS_MARK_READ]: { ok: true }
  [IPC_CHANNELS.NOTIFICATIONS_MARK_READ_FOR_CONVERSATION]: { ok: true; markedRead: number }
  [IPC_CHANNELS.NOTIFICATIONS_CLEAR_ALL]: { ok: true; cleared: number }
  [IPC_CHANNELS.REMINDERS_LIST]: Reminder[]
  [IPC_CHANNELS.REMINDERS_CREATE]: Reminder
  [IPC_CHANNELS.REMINDERS_UPDATE]: Reminder
  [IPC_CHANNELS.REMINDERS_DELETE]: { ok: true }
  [IPC_CHANNELS.WINDOW_CLOSE]: { ok: true }
  [IPC_CHANNELS.WINDOW_MAXIMIZE]: { ok: true; isMaximized: boolean }
  [IPC_CHANNELS.WINDOW_MINIMIZE]: { ok: true }
  [IPC_CHANNELS.SHELL_OPEN_EXTERNAL]: { ok: true }
  [IPC_CHANNELS.OMNIBROWSER_SPACES_LIST]: BrowserSpace[]
  [IPC_CHANNELS.OMNIBROWSER_SPACES_CREATE]: BrowserSpace
  [IPC_CHANNELS.OMNIBROWSER_SPACES_UPDATE]: BrowserSpace
  [IPC_CHANNELS.OMNIBROWSER_SPACES_DELETE]: { ok: true }
  [IPC_CHANNELS.OMNIBROWSER_SPACES_REORDER]: BrowserSpace[]
  [IPC_CHANNELS.OMNIBROWSER_SPACES_SET_ACTIVE]: { ok: true }
  [IPC_CHANNELS.OMNIBROWSER_SPACES_SET_AD_BLOCK]: BrowserSpace
  [IPC_CHANNELS.OMNIBROWSER_CATEGORIES_LIST]: BrowserBookmarkCategory[]
  [IPC_CHANNELS.OMNIBROWSER_CATEGORIES_CREATE]: BrowserBookmarkCategory
  [IPC_CHANNELS.OMNIBROWSER_CATEGORIES_UPDATE]: BrowserBookmarkCategory
  [IPC_CHANNELS.OMNIBROWSER_CATEGORIES_DELETE]: { ok: true }
  [IPC_CHANNELS.OMNIBROWSER_CATEGORIES_REORDER]: BrowserBookmarkCategory[]
  [IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_LIST]: BrowserBookmark[]
  [IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_CREATE]: BrowserBookmark
  [IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_UPDATE]: BrowserBookmark
  [IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_DELETE]: { ok: true }
  [IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_REORDER]: BrowserBookmark[]
  [IPC_CHANNELS.OMNIBROWSER_HISTORY_RECORD]: BrowserHistoryEntry
  [IPC_CHANNELS.OMNIBROWSER_HISTORY_LIST]: BrowserHistoryEntry[]
  [IPC_CHANNELS.OMNIBROWSER_HISTORY_SEARCH]: BrowserHistoryEntry[]
  [IPC_CHANNELS.OMNIBROWSER_HISTORY_DELETE]: { ok: true }
  [IPC_CHANNELS.OMNIBROWSER_HISTORY_CLEAR]: { ok: true }
  [IPC_CHANNELS.OMNIBROWSER_TABS_LIST]: BrowserTab[]
  [IPC_CHANNELS.OMNIBROWSER_TABS_UPSERT]: BrowserTab
  [IPC_CHANNELS.OMNIBROWSER_TABS_SET_ACTIVE]: { ok: true }
  [IPC_CHANNELS.OMNIBROWSER_TABS_CLOSE]: { ok: true }
  [IPC_CHANNELS.OMNIBROWSER_TABS_REORDER]: BrowserTab[]
  [IPC_CHANNELS.OMNIBROWSER_TABS_SET_GROUP]: BrowserTab | null
  [IPC_CHANNELS.OMNIBROWSER_TABS_SET_TITLE]: BrowserTab | null
  [IPC_CHANNELS.OMNIBROWSER_OMNIBOX_SUGGEST]: OmniboxSuggestion[]
  [IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_LIST]: BrowserTabGroup[]
  [IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_CREATE]: BrowserTabGroup
  [IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_UPDATE]: BrowserTabGroup
  [IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_DELETE]: { ok: true }
  [IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_REORDER]: BrowserTabGroup[]
  [IPC_CHANNELS.OMNIBROWSER_SETTINGS_GET]: OmniBrowserSettings
  [IPC_CHANNELS.OMNIBROWSER_SETTINGS_UPDATE]: OmniBrowserSettings
  [IPC_CHANNELS.OMNIBROWSER_SHORTCUTS_CAPTURE]: { ok: true }
  [IPC_CHANNELS.OMNIBROWSER_EXTENSIONS_LIST]: BrowserExtension[]
  [IPC_CHANNELS.OMNIBROWSER_EXTENSIONS_ADD]: BrowserExtension | null
  [IPC_CHANNELS.OMNIBROWSER_EXTENSIONS_SET_ENABLED]: BrowserExtension
  [IPC_CHANNELS.OMNIBROWSER_EXTENSIONS_REMOVE]: { ok: true }
  [IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_ATTACH]: { ok: true }
  [IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_SET_BOUNDS]: { ok: true }
  [IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_DETACH]: { ok: true }
  [IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_INSPECT]: { ok: true }
  [IPC_CHANNELS.OMNIBROWSER_CREDENTIALS_SAVE]: BrowserCredential
  [IPC_CHANNELS.OMNIBROWSER_CREDENTIALS_FOR_ORIGIN]: BrowserCredentialFill | null
  [IPC_CHANNELS.OMNIBROWSER_CREDENTIALS_LIST]: BrowserCredential[]
  [IPC_CHANNELS.OMNIBROWSER_CREDENTIALS_DELETE]: { ok: true }
  [IPC_CHANNELS.PASSVAULT_GET_STATUS]: PassVaultState
  [IPC_CHANNELS.PASSVAULT_CREATE]: PassVaultState
  [IPC_CHANNELS.PASSVAULT_UNLOCK]: PassVaultState
  [IPC_CHANNELS.PASSVAULT_LOCK]: PassVaultState
  [IPC_CHANNELS.PASSVAULT_LIST_ENTRIES]: PassEntrySummary[]
  [IPC_CHANNELS.PASSVAULT_CREATE_ENTRY]: PassEntrySummary
  [IPC_CHANNELS.PASSVAULT_UPDATE_ENTRY]: PassEntrySummary
  [IPC_CHANNELS.PASSVAULT_DELETE_ENTRY]: { ok: true }
  [IPC_CHANNELS.PASSVAULT_REVEAL_ENTRY]: PassEntrySecret
  [IPC_CHANNELS.PASSVAULT_COPY_PASSWORD]: { ok: true }
  [IPC_CHANNELS.PASSVAULT_GENERATE_PASSWORD]: { password: string }
  [IPC_CHANNELS.PASSVAULT_LIST_FOLDERS]: PassFolderSummary[]
  [IPC_CHANNELS.PASSVAULT_CREATE_FOLDER]: PassFolderSummary
  [IPC_CHANNELS.PASSVAULT_UPDATE_FOLDER]: PassFolderSummary
  [IPC_CHANNELS.PASSVAULT_DELETE_FOLDER]: { ok: true }
  [IPC_CHANNELS.PASSVAULT_REORDER_FOLDERS]: { ok: true }
  [IPC_CHANNELS.PASSVAULT_REORDER_ENTRIES]: { ok: true }
  [IPC_CHANNELS.PASSVAULT_GENERATE_PASSPHRASE]: { password: string }
  [IPC_CHANNELS.PASSVAULT_CHANGE_MASTER]: PassVaultState
  [IPC_CHANNELS.PASSVAULT_BIOMETRIC_ENABLE]: PassVaultState
  [IPC_CHANNELS.PASSVAULT_BIOMETRIC_DISABLE]: PassVaultState
  [IPC_CHANNELS.PASSVAULT_BIOMETRIC_UNLOCK]: PassVaultState
  [IPC_CHANNELS.PASSVAULT_RECOVERY_ENABLE]: { code: string }
  [IPC_CHANNELS.PASSVAULT_RECOVERY_DISABLE]: PassVaultState
  [IPC_CHANNELS.PASSVAULT_RECOVERY_UNLOCK]: PassVaultState
  [IPC_CHANNELS.PASSVAULT_EXPORT]: { saved: boolean }
  [IPC_CHANNELS.PASSVAULT_IMPORT]: { folders: number; entries: number } | null
  [IPC_CHANNELS.PASSVAULT_IMPORT_BROWSER]: { imported: number }
  [IPC_CHANNELS.PASSVAULT_FIND_FOR_ORIGIN]: { username: string; password: string } | null
  [IPC_CHANNELS.BACKUP_EXPORT]: { saved: boolean }
  [IPC_CHANNELS.BACKUP_IMPORT]: { restored: boolean }
  [IPC_CHANNELS.AI_GET_SETTINGS]: AiStatus
  [IPC_CHANNELS.AI_SET_SETTINGS]: AiSettings
  [IPC_CHANNELS.AI_SET_TOKEN]: AiTokenState
  [IPC_CHANNELS.AI_CLEAR_TOKEN]: AiTokenState
  [IPC_CHANNELS.AI_TEST_CONNECTION]: AiConnectionTestResult
  [IPC_CHANNELS.AI_CHAT_SEND]: { ok: true }
  [IPC_CHANNELS.AI_CHAT_CANCEL]: { ok: true }
  [IPC_CHANNELS.AI_CONFIRM]: { ok: true }
  [IPC_CHANNELS.AI_TRANSCRIBE]: { text: string }
}

// Evenement pousse main -> renderer quand le coffre est verrouille (manuel ou auto-lock).
export interface PassVaultLockedEvent {
  reason: 'manual' | 'timeout'
}

export interface OmniBrowserOpenTabEvent {
  sourceWebContentsId: number
  url: string
}

export interface OmniBrowserInspectEvent {
  sourceWebContentsId: number
  x: number
  y: number
}

export interface OmnichatTokenResult {
  url: string
  token: string
  roomName: string
  identity: string
}

export interface SyncUpdatedEvent {
  accountId: string
  conversations: number
  messages: number
}

/**
 * Etat de la mise a jour applicative (electron-updater). Pousse au renderer via
 * PRELOAD_EVENTS.UPDATE_STATUS a chaque transition, et lisible a la demande via
 * APP_GET_UPDATE_STATUS (pour amorcer l'UI au montage). 'idle' = a jour ou pas
 * encore verifie ; l'indicateur reste masque tant qu'aucune MAJ n'est en jeu.
 */
export type AppUpdateStatus =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'available'; version: string }
  | { phase: 'downloading'; percent: number }
  | { phase: 'downloaded'; version: string }
  | { phase: 'error'; message: string }

/** Un groupe de lignes sous une version du changelog (sous-titre Keep a Changelog optionnel). */
export interface ChangelogGroup {
  label: string | null
  items: string[]
}

/**
 * Une version parsee depuis CHANGELOG.md (lu cote main). Sert a la modal affichee une
 * seule fois apres une mise a jour, pour montrer ce qui a change.
 */
export interface ChangelogEntry {
  version: string
  date: string | null
  groups: ChangelogGroup[]
}

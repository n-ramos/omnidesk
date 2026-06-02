import { ipcRenderer } from 'electron'
import type {
  AppNavShortcutAction,
  IpcChannel,
  IpcRequestMap,
  IpcResponseMap,
  OmniBrowserInspectEvent,
  OmniBrowserOpenTabEvent,
  OmniBrowserShortcutAction,
  PassVaultLockedEvent,
  SyncUpdatedEvent,
} from '@shared/ipc'
import { IPC_CHANNELS, PRELOAD_EVENTS } from '@shared/ipc'
import type {
  ComposeMailRequest,
  ConnectImapAccountInput,
  ConnectWebpageAccountInput,
  ConversationFilters,
  CreateBrowserSpaceInput,
  CreateDraftAccountInput,
  CreateReminderInput,
  HomeWidgetInstance,
  LocalNotification,
  OmnichatCallActiveEvent,
  OmnichatCallRingEvent,
  OmnichatCallStateEvent,
  OmnichatConnectionEvent,
  OmnichatGroupEvent,
  OmnichatMessageEvent,
  OmnichatPresenceEvent,
  OmnichatReactionEvent,
  OmnichatReceiptEvent,
  OmnichatTypingEvent,
  SendMessageRequest,
  StartupView,
  ToggleReactionRequest,
  UpdateBrowserSpaceInput,
  UpdateMessageStateInput,
  UpdateReminderInput,
} from '@shared/models'

const invoke = <Channel extends IpcChannel>(
  channel: Channel,
  payload: IpcRequestMap[Channel],
): Promise<IpcResponseMap[Channel]> => ipcRenderer.invoke(channel, payload)

export interface OmnideskApi {
  app: {
    getBootstrap: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.APP_GET_BOOTSTRAP]>
    setBadgeCount: (
      count: number,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.APP_SET_BADGE_COUNT]>
  }
  providers: {
    list: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.PROVIDERS_LIST]>
  }
  accounts: {
    list: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.ACCOUNTS_LIST]>
    createDraft: (
      input: CreateDraftAccountInput,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.ACCOUNTS_CREATE_DRAFT]>
    refresh: (accountId: string) => Promise<IpcResponseMap[typeof IPC_CHANNELS.ACCOUNTS_REFRESH]>
    disconnect: (
      accountId: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.ACCOUNTS_DISCONNECT]>
    reorder: (ids: string[]) => Promise<IpcResponseMap[typeof IPC_CHANNELS.ACCOUNTS_REORDER]>
  }
  imap: {
    autodiscover: (
      email: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.IMAP_AUTODISCOVER]>
    test: (
      input: IpcRequestMap[typeof IPC_CHANNELS.IMAP_TEST],
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.IMAP_TEST]>
    connect: (
      input: ConnectImapAccountInput,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.IMAP_CONNECT]>
    listFolders: (
      accountId: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.IMAP_LIST_FOLDERS]>
    selectFolder: (
      accountId: string,
      folderPath: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.IMAP_SELECT_FOLDER]>
    compose: (
      input: ComposeMailRequest,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.IMAP_COMPOSE]>
    markRead: (
      conversationId: string,
      read: boolean,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.IMAP_MARK_READ]>
    loadMore: (
      accountId: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.IMAP_LOAD_MORE]>
    deleteConversation: (
      conversationId: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.IMAP_DELETE_CONVERSATION]>
    moveConversation: (
      conversationId: string,
      folderPath: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.IMAP_MOVE_CONVERSATION]>
  }
  webpage: {
    connect: (
      input: ConnectWebpageAccountInput,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.WEBPAGE_CONNECT]>
    setKeepAlive: (
      accountId: string,
      keepAlive: boolean,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.WEBPAGE_SET_KEEP_ALIVE]>
    setFavicon: (
      accountId: string,
      faviconUrl: string | null,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.WEBPAGE_SET_FAVICON]>
    setAdBlock: (
      accountId: string,
      enabled: boolean,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.WEBPAGE_SET_AD_BLOCK]>
    notify: (
      accountId: string,
      title: string,
      body?: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.WEBPAGE_NOTIFY]>
    sendMediaKey: (
      webContentsId: number,
      key: 'play-pause' | 'next' | 'previous' | 'stop',
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.WEBVIEW_SEND_MEDIA_KEY]>
  }
  conversations: {
    list: (
      filters?: ConversationFilters,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.CONVERSATIONS_LIST]>
    get: (
      conversationId: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.CONVERSATIONS_GET]>
    focus: (
      conversationId: string | null,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.CONVERSATIONS_FOCUS]>
    markRead: (
      conversationId: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.CONVERSATIONS_MARK_READ]>
    lookupExternal: (
      accountId: string,
      externalConversationId: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.CONVERSATIONS_LOOKUP_EXTERNAL]>
    openDirect: (
      accountId: string,
      contactExternalId: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.CONVERSATIONS_OPEN_DIRECT]>
  }
  contacts: {
    list: (accountId: string) => Promise<IpcResponseMap[typeof IPC_CHANNELS.CONTACTS_LIST]>
  }
  messages: {
    updateState: (
      input: UpdateMessageStateInput,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.MESSAGES_UPDATE_STATE]>
    send: (
      input: SendMessageRequest,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.MESSAGES_SEND]>
    toggleReaction: (
      input: ToggleReactionRequest,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.MESSAGES_TOGGLE_REACTION]>
  }
  attachments: {
    open: (
      attachmentId: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.ATTACHMENTS_OPEN]>
  }
  omnichat: {
    getCallToken: (
      callId: string,
      room: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_GET_CALL_TOKEN]>
    startRecording: (
      callId: string,
      room: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_START_RECORDING]>
    stopRecording: (
      egressId: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_STOP_RECORDING]>
    watchGroup: (
      conversationId: string | null,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_WATCH_GROUP]>
    setGroupCall: (
      input: IpcRequestMap[typeof IPC_CHANNELS.OMNICHAT_SET_GROUP_CALL],
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_SET_GROUP_CALL]>
    availability: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_AVAILABILITY]>
    getIdentity: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_GET_IDENTITY]>
    setIdentity: (
      pseudo: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_SET_IDENTITY]>
    addContact: (
      pseudo: string,
      id: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_ADD_CONTACT]>
    removeContact: (
      id: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_REMOVE_CONTACT]>
    listContacts: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_LIST_CONTACTS]>
    openDm: (
      peerId: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_OPEN_DM]>
    dmPeer: (
      conversationId: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_DM_PEER]>
    createGroup: (
      title: string,
      members: string[],
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_CREATE_GROUP]>
    updateGroup: (
      input: IpcRequestMap[typeof IPC_CHANNELS.OMNICHAT_UPDATE_GROUP],
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_UPDATE_GROUP]>
    send: (
      conversationId: string,
      body: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_SEND]>
    typing: (
      conversationId: string,
      state: 'start' | 'stop',
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_TYPING]>
    sendReceipt: (
      conversationId: string,
      serverMsgId: string,
      state: 'delivered' | 'read',
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_SEND_RECEIPT]>
    callInvite: (
      input: IpcRequestMap[typeof IPC_CHANNELS.OMNICHAT_CALL_INVITE],
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_CALL_INVITE]>
    callAccept: (
      from: string,
      callId: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_CALL_ACCEPT]>
    callDecline: (
      input: IpcRequestMap[typeof IPC_CHANNELS.OMNICHAT_CALL_DECLINE],
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_CALL_DECLINE]>
    callCancel: (
      from: string,
      callId: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_CALL_CANCEL]>
    joinGroup: (
      groupId: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_JOIN_GROUP]>
    leaveGroup: (
      conversationId: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_LEAVE_GROUP]>
    groupCode: (
      conversationId: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNICHAT_GROUP_CODE]>
  }
  tenor: {
    status: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.TENOR_STATUS]>
    featured: (limit?: number) => Promise<IpcResponseMap[typeof IPC_CHANNELS.TENOR_FEATURED]>
    search: (query: string, limit?: number) => Promise<IpcResponseMap[typeof IPC_CHANNELS.TENOR_SEARCH]>
  }
  settings: {
    getLocalStatus: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.SETTINGS_GET_LOCAL_STATUS]>
    getStartupView: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.SETTINGS_GET_STARTUP_VIEW]>
    setStartupView: (
      view: StartupView,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.SETTINGS_SET_STARTUP_VIEW]>
    getAccentColor: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.SETTINGS_GET_ACCENT_COLOR]>
    setAccentColor: (
      color: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.SETTINGS_SET_ACCENT_COLOR]>
    getBaseColor: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.SETTINGS_GET_BASE_COLOR]>
    setBaseColor: (
      color: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.SETTINGS_SET_BASE_COLOR]>
    getNavShortcuts: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.SETTINGS_GET_NAV_SHORTCUTS]>
    setNavShortcuts: (
      shortcuts: IpcRequestMap[typeof IPC_CHANNELS.SETTINGS_SET_NAV_SHORTCUTS]['shortcuts'],
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.SETTINGS_SET_NAV_SHORTCUTS]>
    exportBackup: (
      password: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.BACKUP_EXPORT]>
    importBackup: (
      password: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.BACKUP_IMPORT]>
  }
  home: {
    getLayout: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.HOME_GET_LAYOUT]>
    saveLayout: (
      widgets: HomeWidgetInstance[],
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.HOME_SAVE_LAYOUT]>
  }
  weather: {
    fetch: (
      input: IpcRequestMap[typeof IPC_CHANNELS.WEATHER_FETCH],
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.WEATHER_FETCH]>
    searchCities: (
      query: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.WEATHER_SEARCH_CITIES]>
  }
  rss: {
    fetch: (
      url: string,
      limit?: number,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.RSS_FETCH]>
  }
  notifications: {
    list: (
      unreadOnly?: boolean,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.NOTIFICATIONS_LIST]>
    markRead: (
      notificationId: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.NOTIFICATIONS_MARK_READ]>
    markReadForConversation: (
      conversationId: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.NOTIFICATIONS_MARK_READ_FOR_CONVERSATION]>
    clearAll: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.NOTIFICATIONS_CLEAR_ALL]>
  }
  reminders: {
    list: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.REMINDERS_LIST]>
    create: (
      input: CreateReminderInput,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.REMINDERS_CREATE]>
    update: (
      input: UpdateReminderInput,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.REMINDERS_UPDATE]>
    delete: (id: string) => Promise<IpcResponseMap[typeof IPC_CHANNELS.REMINDERS_DELETE]>
  }
  omnibrowser: {
    spaces: {
      list: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_SPACES_LIST]>
      create: (
        input: CreateBrowserSpaceInput,
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_SPACES_CREATE]>
      update: (
        input: UpdateBrowserSpaceInput,
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_SPACES_UPDATE]>
      delete: (id: string) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_SPACES_DELETE]>
      reorder: (ids: string[]) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_SPACES_REORDER]>
      setActive: (id: string) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_SPACES_SET_ACTIVE]>
      setAdBlock: (
        spaceId: string,
        enabled: boolean,
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_SPACES_SET_AD_BLOCK]>
    }
    categories: {
      list: (spaceId: string) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_CATEGORIES_LIST]>
      create: (
        spaceId: string,
        name: string,
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_CATEGORIES_CREATE]>
      update: (
        id: string,
        name: string,
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_CATEGORIES_UPDATE]>
      delete: (id: string) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_CATEGORIES_DELETE]>
      reorder: (
        spaceId: string,
        ids: string[],
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_CATEGORIES_REORDER]>
    }
    bookmarks: {
      list: (spaceId: string) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_LIST]>
      create: (
        input: IpcRequestMap[typeof IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_CREATE],
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_CREATE]>
      update: (
        input: IpcRequestMap[typeof IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_UPDATE],
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_UPDATE]>
      delete: (id: string) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_DELETE]>
      reorder: (
        spaceId: string,
        ids: string[],
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_REORDER]>
    }
    history: {
      record: (
        input: IpcRequestMap[typeof IPC_CHANNELS.OMNIBROWSER_HISTORY_RECORD],
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_HISTORY_RECORD]>
      list: (
        spaceId: string,
        options?: { limit?: number; before?: string },
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_HISTORY_LIST]>
      search: (
        spaceId: string,
        query: string,
        limit?: number,
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_HISTORY_SEARCH]>
      delete: (id: string) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_HISTORY_DELETE]>
      clear: (spaceId: string) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_HISTORY_CLEAR]>
    }
    tabs: {
      list: (spaceId: string) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_TABS_LIST]>
      upsert: (
        input: IpcRequestMap[typeof IPC_CHANNELS.OMNIBROWSER_TABS_UPSERT],
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_TABS_UPSERT]>
      setActive: (
        spaceId: string,
        tabId: string,
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_TABS_SET_ACTIVE]>
      close: (id: string) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_TABS_CLOSE]>
      reorder: (
        spaceId: string,
        ids: string[],
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_TABS_REORDER]>
      setGroup: (
        tabId: string,
        groupId: string | null,
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_TABS_SET_GROUP]>
      setTitle: (
        tabId: string,
        title: string | null,
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_TABS_SET_TITLE]>
    }
    tabGroups: {
      list: (spaceId: string) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_LIST]>
      create: (
        input: IpcRequestMap[typeof IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_CREATE],
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_CREATE]>
      update: (
        input: IpcRequestMap[typeof IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_UPDATE],
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_UPDATE]>
      delete: (id: string) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_DELETE]>
      reorder: (
        spaceId: string,
        ids: string[],
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_REORDER]>
    }
    omnibox: {
      suggest: (
        spaceId: string,
        query: string,
        limit?: number,
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_OMNIBOX_SUGGEST]>
    }
    settings: {
      get: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_SETTINGS_GET]>
      update: (
        patch: IpcRequestMap[typeof IPC_CHANNELS.OMNIBROWSER_SETTINGS_UPDATE],
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_SETTINGS_UPDATE]>
    }
    shortcuts: {
      setCaptureMode: (
        capturing: boolean,
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_SHORTCUTS_CAPTURE]>
    }
    extensions: {
      list: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_EXTENSIONS_LIST]>
      add: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_EXTENSIONS_ADD]>
      setEnabled: (
        id: string,
        enabled: boolean,
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_EXTENSIONS_SET_ENABLED]>
      remove: (id: string) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_EXTENSIONS_REMOVE]>
    }
    devtools: {
      attach: (
        input: IpcRequestMap[typeof IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_ATTACH],
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_ATTACH]>
      setBounds: (
        input: IpcRequestMap[typeof IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_SET_BOUNDS],
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_SET_BOUNDS]>
      detach: (
        guestWebContentsId: number,
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_DETACH]>
      inspectDetached: (
        webContentsId: number,
        x: number,
        y: number,
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_INSPECT]>
    }
    credentials: {
      save: (
        input: IpcRequestMap[typeof IPC_CHANNELS.OMNIBROWSER_CREDENTIALS_SAVE],
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_CREDENTIALS_SAVE]>
      forOrigin: (
        origin: string,
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_CREDENTIALS_FOR_ORIGIN]>
      list: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_CREDENTIALS_LIST]>
      delete: (
        id: string,
      ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.OMNIBROWSER_CREDENTIALS_DELETE]>
    }
  }
  passvault: {
    getStatus: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_GET_STATUS]>
    createVault: (
      masterPassword: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_CREATE]>
    unlock: (
      masterPassword: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_UNLOCK]>
    lock: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_LOCK]>
    listEntries: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_LIST_ENTRIES]>
    createEntry: (
      input: IpcRequestMap[typeof IPC_CHANNELS.PASSVAULT_CREATE_ENTRY],
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_CREATE_ENTRY]>
    updateEntry: (
      input: IpcRequestMap[typeof IPC_CHANNELS.PASSVAULT_UPDATE_ENTRY],
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_UPDATE_ENTRY]>
    deleteEntry: (id: string) => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_DELETE_ENTRY]>
    revealEntry: (id: string) => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_REVEAL_ENTRY]>
    copyPassword: (
      id: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_COPY_PASSWORD]>
    generatePassword: (
      options: IpcRequestMap[typeof IPC_CHANNELS.PASSVAULT_GENERATE_PASSWORD],
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_GENERATE_PASSWORD]>
    listFolders: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_LIST_FOLDERS]>
    createFolder: (
      input: IpcRequestMap[typeof IPC_CHANNELS.PASSVAULT_CREATE_FOLDER],
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_CREATE_FOLDER]>
    updateFolder: (
      input: IpcRequestMap[typeof IPC_CHANNELS.PASSVAULT_UPDATE_FOLDER],
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_UPDATE_FOLDER]>
    deleteFolder: (
      id: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_DELETE_FOLDER]>
    reorderFolders: (
      parentId: string | null,
      ids: string[],
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_REORDER_FOLDERS]>
    reorderEntries: (
      folderId: string | null,
      ids: string[],
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_REORDER_ENTRIES]>
    generatePassphrase: (
      options: IpcRequestMap[typeof IPC_CHANNELS.PASSVAULT_GENERATE_PASSPHRASE],
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_GENERATE_PASSPHRASE]>
    changeMasterPassword: (
      oldPassword: string,
      newPassword: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_CHANGE_MASTER]>
    biometricEnable: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_BIOMETRIC_ENABLE]>
    biometricDisable: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_BIOMETRIC_DISABLE]>
    biometricUnlock: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_BIOMETRIC_UNLOCK]>
    recoveryEnable: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_RECOVERY_ENABLE]>
    recoveryDisable: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_RECOVERY_DISABLE]>
    recoveryUnlock: (
      code: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_RECOVERY_UNLOCK]>
    exportVault: (password: string) => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_EXPORT]>
    importVault: (password: string) => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_IMPORT]>
    importBrowser: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_IMPORT_BROWSER]>
    findForOrigin: (
      origin: string,
    ) => Promise<IpcResponseMap[typeof IPC_CHANNELS.PASSVAULT_FIND_FOR_ORIGIN]>
  }
  window: {
    minimize: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.WINDOW_MINIMIZE]>
    maximize: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.WINDOW_MAXIMIZE]>
    close: () => Promise<IpcResponseMap[typeof IPC_CHANNELS.WINDOW_CLOSE]>
  }
  shell: {
    openExternal: (url: string) => Promise<IpcResponseMap[typeof IPC_CHANNELS.SHELL_OPEN_EXTERNAL]>
  }
  events: {
    onSyncUpdated: (listener: (event: SyncUpdatedEvent) => void) => () => void
    onReminderFired: (listener: (notification: LocalNotification) => void) => () => void
    onNotificationCreated: (listener: (notification: LocalNotification) => void) => () => void
    onOmniBrowserOpenTab: (listener: (event: OmniBrowserOpenTabEvent) => void) => () => void
    onOmniBrowserShortcut: (listener: (action: OmniBrowserShortcutAction) => void) => () => void
    onAppNavShortcut: (listener: (action: AppNavShortcutAction) => void) => () => void
    onOmniBrowserInspect: (listener: (event: OmniBrowserInspectEvent) => void) => () => void
    onOmnichatConnection: (listener: (event: OmnichatConnectionEvent) => void) => () => void
    onOmnichatMessage: (listener: (event: OmnichatMessageEvent) => void) => () => void
    onOmnichatPresence: (listener: (event: OmnichatPresenceEvent) => void) => () => void
    onOmnichatGroup: (listener: (event: OmnichatGroupEvent) => void) => () => void
    onOmnichatTyping: (listener: (event: OmnichatTypingEvent) => void) => () => void
    onOmnichatReceipt: (listener: (event: OmnichatReceiptEvent) => void) => () => void
    onOmnichatCallRing: (listener: (event: OmnichatCallRingEvent) => void) => () => void
    onOmnichatCallState: (listener: (event: OmnichatCallStateEvent) => void) => () => void
    onOmnichatReaction: (listener: (event: OmnichatReactionEvent) => void) => () => void
    onOmnichatCallActive: (listener: (event: OmnichatCallActiveEvent) => void) => () => void
    onPassvaultLocked: (listener: (event: PassVaultLockedEvent) => void) => () => void
  }
}

export const omnideskApi: OmnideskApi = {
  app: {
    getBootstrap: () => invoke(IPC_CHANNELS.APP_GET_BOOTSTRAP, undefined),
    setBadgeCount: (count) => invoke(IPC_CHANNELS.APP_SET_BADGE_COUNT, { count }),
  },
  providers: {
    list: () => invoke(IPC_CHANNELS.PROVIDERS_LIST, undefined),
  },
  accounts: {
    list: () => invoke(IPC_CHANNELS.ACCOUNTS_LIST, undefined),
    createDraft: (input) => invoke(IPC_CHANNELS.ACCOUNTS_CREATE_DRAFT, input),
    refresh: (accountId) => invoke(IPC_CHANNELS.ACCOUNTS_REFRESH, { accountId }),
    disconnect: (accountId) => invoke(IPC_CHANNELS.ACCOUNTS_DISCONNECT, { accountId }),
    reorder: (ids) => invoke(IPC_CHANNELS.ACCOUNTS_REORDER, { ids }),
  },
  imap: {
    autodiscover: (email) => invoke(IPC_CHANNELS.IMAP_AUTODISCOVER, { email }),
    test: (input) => invoke(IPC_CHANNELS.IMAP_TEST, input),
    connect: (input) => invoke(IPC_CHANNELS.IMAP_CONNECT, input),
    listFolders: (accountId) => invoke(IPC_CHANNELS.IMAP_LIST_FOLDERS, { accountId }),
    selectFolder: (accountId, folderPath) =>
      invoke(IPC_CHANNELS.IMAP_SELECT_FOLDER, { accountId, folderPath }),
    compose: (input) => invoke(IPC_CHANNELS.IMAP_COMPOSE, input),
    markRead: (conversationId, read) =>
      invoke(IPC_CHANNELS.IMAP_MARK_READ, { conversationId, read }),
    loadMore: (accountId) => invoke(IPC_CHANNELS.IMAP_LOAD_MORE, { accountId }),
    deleteConversation: (conversationId) =>
      invoke(IPC_CHANNELS.IMAP_DELETE_CONVERSATION, { conversationId }),
    moveConversation: (conversationId, folderPath) =>
      invoke(IPC_CHANNELS.IMAP_MOVE_CONVERSATION, { conversationId, folderPath }),
  },
  webpage: {
    connect: (input) => invoke(IPC_CHANNELS.WEBPAGE_CONNECT, input),
    setKeepAlive: (accountId, keepAlive) =>
      invoke(IPC_CHANNELS.WEBPAGE_SET_KEEP_ALIVE, { accountId, keepAlive }),
    setFavicon: (accountId, faviconUrl) =>
      invoke(IPC_CHANNELS.WEBPAGE_SET_FAVICON, { accountId, faviconUrl }),
    setAdBlock: (accountId, enabled) =>
      invoke(IPC_CHANNELS.WEBPAGE_SET_AD_BLOCK, { accountId, enabled }),
    notify: (accountId, title, body) =>
      invoke(IPC_CHANNELS.WEBPAGE_NOTIFY, { accountId, title, body }),
    sendMediaKey: (webContentsId, key) =>
      invoke(IPC_CHANNELS.WEBVIEW_SEND_MEDIA_KEY, { webContentsId, key }),
  },
  conversations: {
    list: (filters) => invoke(IPC_CHANNELS.CONVERSATIONS_LIST, filters),
    get: (conversationId) => invoke(IPC_CHANNELS.CONVERSATIONS_GET, { conversationId }),
    focus: (conversationId) => invoke(IPC_CHANNELS.CONVERSATIONS_FOCUS, { conversationId }),
    markRead: (conversationId) => invoke(IPC_CHANNELS.CONVERSATIONS_MARK_READ, { conversationId }),
    lookupExternal: (accountId, externalConversationId) =>
      invoke(IPC_CHANNELS.CONVERSATIONS_LOOKUP_EXTERNAL, { accountId, externalConversationId }),
    openDirect: (accountId, contactExternalId) =>
      invoke(IPC_CHANNELS.CONVERSATIONS_OPEN_DIRECT, { accountId, contactExternalId }),
  },
  contacts: {
    list: (accountId) => invoke(IPC_CHANNELS.CONTACTS_LIST, { accountId }),
  },
  messages: {
    updateState: (input) => invoke(IPC_CHANNELS.MESSAGES_UPDATE_STATE, input),
    send: (input) => invoke(IPC_CHANNELS.MESSAGES_SEND, input),
    toggleReaction: (input) => invoke(IPC_CHANNELS.MESSAGES_TOGGLE_REACTION, input),
  },
  attachments: {
    open: (attachmentId) => invoke(IPC_CHANNELS.ATTACHMENTS_OPEN, { attachmentId }),
  },
  omnichat: {
    getCallToken: (callId, room) => invoke(IPC_CHANNELS.OMNICHAT_GET_CALL_TOKEN, { callId, room }),
    startRecording: (callId, room) =>
      invoke(IPC_CHANNELS.OMNICHAT_START_RECORDING, { callId, room }),
    stopRecording: (egressId) => invoke(IPC_CHANNELS.OMNICHAT_STOP_RECORDING, { egressId }),
    watchGroup: (conversationId) => invoke(IPC_CHANNELS.OMNICHAT_WATCH_GROUP, { conversationId }),
    setGroupCall: (input) => invoke(IPC_CHANNELS.OMNICHAT_SET_GROUP_CALL, input),
    availability: () => invoke(IPC_CHANNELS.OMNICHAT_AVAILABILITY, undefined),
    getIdentity: () => invoke(IPC_CHANNELS.OMNICHAT_GET_IDENTITY, undefined),
    setIdentity: (pseudo) => invoke(IPC_CHANNELS.OMNICHAT_SET_IDENTITY, { pseudo }),
    addContact: (pseudo, id) => invoke(IPC_CHANNELS.OMNICHAT_ADD_CONTACT, { pseudo, id }),
    removeContact: (id) => invoke(IPC_CHANNELS.OMNICHAT_REMOVE_CONTACT, { id }),
    listContacts: () => invoke(IPC_CHANNELS.OMNICHAT_LIST_CONTACTS, undefined),
    openDm: (peerId) => invoke(IPC_CHANNELS.OMNICHAT_OPEN_DM, { peerId }),
    dmPeer: (conversationId) => invoke(IPC_CHANNELS.OMNICHAT_DM_PEER, { conversationId }),
    createGroup: (title, members) => invoke(IPC_CHANNELS.OMNICHAT_CREATE_GROUP, { title, members }),
    updateGroup: (input) => invoke(IPC_CHANNELS.OMNICHAT_UPDATE_GROUP, input),
    send: (conversationId, body) => invoke(IPC_CHANNELS.OMNICHAT_SEND, { conversationId, body }),
    typing: (conversationId, state) => invoke(IPC_CHANNELS.OMNICHAT_TYPING, { conversationId, state }),
    sendReceipt: (conversationId, serverMsgId, state) =>
      invoke(IPC_CHANNELS.OMNICHAT_SEND_RECEIPT, { conversationId, serverMsgId, state }),
    callInvite: (input) => invoke(IPC_CHANNELS.OMNICHAT_CALL_INVITE, input),
    callAccept: (from, callId) => invoke(IPC_CHANNELS.OMNICHAT_CALL_ACCEPT, { from, callId }),
    callDecline: (input) => invoke(IPC_CHANNELS.OMNICHAT_CALL_DECLINE, input),
    callCancel: (from, callId) => invoke(IPC_CHANNELS.OMNICHAT_CALL_CANCEL, { from, callId }),
    joinGroup: (groupId) => invoke(IPC_CHANNELS.OMNICHAT_JOIN_GROUP, { groupId }),
    leaveGroup: (conversationId) => invoke(IPC_CHANNELS.OMNICHAT_LEAVE_GROUP, { conversationId }),
    groupCode: (conversationId) => invoke(IPC_CHANNELS.OMNICHAT_GROUP_CODE, { conversationId }),
  },
  tenor: {
    status: () => invoke(IPC_CHANNELS.TENOR_STATUS, undefined),
    featured: (limit) => invoke(IPC_CHANNELS.TENOR_FEATURED, limit ? { limit } : undefined),
    search: (query, limit) => invoke(IPC_CHANNELS.TENOR_SEARCH, { query, limit }),
  },
  settings: {
    getLocalStatus: () => invoke(IPC_CHANNELS.SETTINGS_GET_LOCAL_STATUS, undefined),
    getStartupView: () => invoke(IPC_CHANNELS.SETTINGS_GET_STARTUP_VIEW, undefined),
    setStartupView: (view) => invoke(IPC_CHANNELS.SETTINGS_SET_STARTUP_VIEW, { view }),
    getAccentColor: () => invoke(IPC_CHANNELS.SETTINGS_GET_ACCENT_COLOR, undefined),
    setAccentColor: (color) => invoke(IPC_CHANNELS.SETTINGS_SET_ACCENT_COLOR, { color }),
    getBaseColor: () => invoke(IPC_CHANNELS.SETTINGS_GET_BASE_COLOR, undefined),
    setBaseColor: (color) => invoke(IPC_CHANNELS.SETTINGS_SET_BASE_COLOR, { color }),
    getNavShortcuts: () => invoke(IPC_CHANNELS.SETTINGS_GET_NAV_SHORTCUTS, undefined),
    setNavShortcuts: (shortcuts) =>
      invoke(IPC_CHANNELS.SETTINGS_SET_NAV_SHORTCUTS, { shortcuts }),
    exportBackup: (password) => invoke(IPC_CHANNELS.BACKUP_EXPORT, { password }),
    importBackup: (password) => invoke(IPC_CHANNELS.BACKUP_IMPORT, { password }),
  },
  home: {
    getLayout: () => invoke(IPC_CHANNELS.HOME_GET_LAYOUT, undefined),
    saveLayout: (widgets) => invoke(IPC_CHANNELS.HOME_SAVE_LAYOUT, { widgets }),
  },
  weather: {
    fetch: (input) => invoke(IPC_CHANNELS.WEATHER_FETCH, input),
    searchCities: (query) => invoke(IPC_CHANNELS.WEATHER_SEARCH_CITIES, { query }),
  },
  rss: {
    fetch: (url, limit) => invoke(IPC_CHANNELS.RSS_FETCH, { url, limit }),
  },
  notifications: {
    list: (unreadOnly) => invoke(IPC_CHANNELS.NOTIFICATIONS_LIST, { unreadOnly }),
    markRead: (notificationId) =>
      invoke(IPC_CHANNELS.NOTIFICATIONS_MARK_READ, { notificationId }),
    markReadForConversation: (conversationId) =>
      invoke(IPC_CHANNELS.NOTIFICATIONS_MARK_READ_FOR_CONVERSATION, { conversationId }),
    clearAll: () => invoke(IPC_CHANNELS.NOTIFICATIONS_CLEAR_ALL, undefined),
  },
  reminders: {
    list: () => invoke(IPC_CHANNELS.REMINDERS_LIST, undefined),
    create: (input) => invoke(IPC_CHANNELS.REMINDERS_CREATE, input),
    update: (input) => invoke(IPC_CHANNELS.REMINDERS_UPDATE, input),
    delete: (id) => invoke(IPC_CHANNELS.REMINDERS_DELETE, { id }),
  },
  omnibrowser: {
    spaces: {
      list: () => invoke(IPC_CHANNELS.OMNIBROWSER_SPACES_LIST, undefined),
      create: (input) => invoke(IPC_CHANNELS.OMNIBROWSER_SPACES_CREATE, input),
      update: (input) => invoke(IPC_CHANNELS.OMNIBROWSER_SPACES_UPDATE, input),
      delete: (id) => invoke(IPC_CHANNELS.OMNIBROWSER_SPACES_DELETE, { id }),
      reorder: (ids) => invoke(IPC_CHANNELS.OMNIBROWSER_SPACES_REORDER, { ids }),
      setActive: (id) => invoke(IPC_CHANNELS.OMNIBROWSER_SPACES_SET_ACTIVE, { id }),
      setAdBlock: (spaceId, enabled) =>
        invoke(IPC_CHANNELS.OMNIBROWSER_SPACES_SET_AD_BLOCK, { spaceId, enabled }),
    },
    categories: {
      list: (spaceId) => invoke(IPC_CHANNELS.OMNIBROWSER_CATEGORIES_LIST, { spaceId }),
      create: (spaceId, name) => invoke(IPC_CHANNELS.OMNIBROWSER_CATEGORIES_CREATE, { spaceId, name }),
      update: (id, name) => invoke(IPC_CHANNELS.OMNIBROWSER_CATEGORIES_UPDATE, { id, name }),
      delete: (id) => invoke(IPC_CHANNELS.OMNIBROWSER_CATEGORIES_DELETE, { id }),
      reorder: (spaceId, ids) => invoke(IPC_CHANNELS.OMNIBROWSER_CATEGORIES_REORDER, { spaceId, ids }),
    },
    bookmarks: {
      list: (spaceId) => invoke(IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_LIST, { spaceId }),
      create: (input) => invoke(IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_CREATE, input),
      update: (input) => invoke(IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_UPDATE, input),
      delete: (id) => invoke(IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_DELETE, { id }),
      reorder: (spaceId, ids) => invoke(IPC_CHANNELS.OMNIBROWSER_BOOKMARKS_REORDER, { spaceId, ids }),
    },
    history: {
      record: (input) => invoke(IPC_CHANNELS.OMNIBROWSER_HISTORY_RECORD, input),
      list: (spaceId, options) =>
        invoke(IPC_CHANNELS.OMNIBROWSER_HISTORY_LIST, { spaceId, ...options }),
      search: (spaceId, query, limit) =>
        invoke(IPC_CHANNELS.OMNIBROWSER_HISTORY_SEARCH, { spaceId, query, limit }),
      delete: (id) => invoke(IPC_CHANNELS.OMNIBROWSER_HISTORY_DELETE, { id }),
      clear: (spaceId) => invoke(IPC_CHANNELS.OMNIBROWSER_HISTORY_CLEAR, { spaceId }),
    },
    tabs: {
      list: (spaceId) => invoke(IPC_CHANNELS.OMNIBROWSER_TABS_LIST, { spaceId }),
      upsert: (input) => invoke(IPC_CHANNELS.OMNIBROWSER_TABS_UPSERT, input),
      setActive: (spaceId, tabId) =>
        invoke(IPC_CHANNELS.OMNIBROWSER_TABS_SET_ACTIVE, { spaceId, tabId }),
      close: (id) => invoke(IPC_CHANNELS.OMNIBROWSER_TABS_CLOSE, { id }),
      reorder: (spaceId, ids) => invoke(IPC_CHANNELS.OMNIBROWSER_TABS_REORDER, { spaceId, ids }),
      setGroup: (tabId, groupId) =>
        invoke(IPC_CHANNELS.OMNIBROWSER_TABS_SET_GROUP, { tabId, groupId }),
      setTitle: (tabId, title) =>
        invoke(IPC_CHANNELS.OMNIBROWSER_TABS_SET_TITLE, { tabId, title }),
    },
    tabGroups: {
      list: (spaceId) => invoke(IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_LIST, { spaceId }),
      create: (input) => invoke(IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_CREATE, input),
      update: (input) => invoke(IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_UPDATE, input),
      delete: (id) => invoke(IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_DELETE, { id }),
      reorder: (spaceId, ids) => invoke(IPC_CHANNELS.OMNIBROWSER_TAB_GROUPS_REORDER, { spaceId, ids }),
    },
    omnibox: {
      suggest: (spaceId, query, limit) =>
        invoke(IPC_CHANNELS.OMNIBROWSER_OMNIBOX_SUGGEST, { spaceId, query, limit }),
    },
    settings: {
      get: () => invoke(IPC_CHANNELS.OMNIBROWSER_SETTINGS_GET, undefined),
      update: (patch) => invoke(IPC_CHANNELS.OMNIBROWSER_SETTINGS_UPDATE, patch),
    },
    shortcuts: {
      setCaptureMode: (capturing) =>
        invoke(IPC_CHANNELS.OMNIBROWSER_SHORTCUTS_CAPTURE, { capturing }),
    },
    extensions: {
      list: () => invoke(IPC_CHANNELS.OMNIBROWSER_EXTENSIONS_LIST, undefined),
      add: () => invoke(IPC_CHANNELS.OMNIBROWSER_EXTENSIONS_ADD, undefined),
      setEnabled: (id, enabled) =>
        invoke(IPC_CHANNELS.OMNIBROWSER_EXTENSIONS_SET_ENABLED, { id, enabled }),
      remove: (id) => invoke(IPC_CHANNELS.OMNIBROWSER_EXTENSIONS_REMOVE, { id }),
    },
    devtools: {
      attach: (input) => invoke(IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_ATTACH, input),
      setBounds: (input) => invoke(IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_SET_BOUNDS, input),
      detach: (guestWebContentsId) =>
        invoke(IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_DETACH, { guestWebContentsId }),
      inspectDetached: (webContentsId, x, y) =>
        invoke(IPC_CHANNELS.OMNIBROWSER_DEVTOOLS_INSPECT, { webContentsId, x, y }),
    },
    credentials: {
      save: (input) => invoke(IPC_CHANNELS.OMNIBROWSER_CREDENTIALS_SAVE, input),
      forOrigin: (origin) => invoke(IPC_CHANNELS.OMNIBROWSER_CREDENTIALS_FOR_ORIGIN, { origin }),
      list: () => invoke(IPC_CHANNELS.OMNIBROWSER_CREDENTIALS_LIST, undefined),
      delete: (id) => invoke(IPC_CHANNELS.OMNIBROWSER_CREDENTIALS_DELETE, { id }),
    },
  },
  passvault: {
    getStatus: () => invoke(IPC_CHANNELS.PASSVAULT_GET_STATUS, undefined),
    createVault: (masterPassword) => invoke(IPC_CHANNELS.PASSVAULT_CREATE, { masterPassword }),
    unlock: (masterPassword) => invoke(IPC_CHANNELS.PASSVAULT_UNLOCK, { masterPassword }),
    lock: () => invoke(IPC_CHANNELS.PASSVAULT_LOCK, undefined),
    listEntries: () => invoke(IPC_CHANNELS.PASSVAULT_LIST_ENTRIES, undefined),
    createEntry: (input) => invoke(IPC_CHANNELS.PASSVAULT_CREATE_ENTRY, input),
    updateEntry: (input) => invoke(IPC_CHANNELS.PASSVAULT_UPDATE_ENTRY, input),
    deleteEntry: (id) => invoke(IPC_CHANNELS.PASSVAULT_DELETE_ENTRY, { id }),
    revealEntry: (id) => invoke(IPC_CHANNELS.PASSVAULT_REVEAL_ENTRY, { id }),
    copyPassword: (id) => invoke(IPC_CHANNELS.PASSVAULT_COPY_PASSWORD, { id }),
    generatePassword: (options) => invoke(IPC_CHANNELS.PASSVAULT_GENERATE_PASSWORD, options),
    listFolders: () => invoke(IPC_CHANNELS.PASSVAULT_LIST_FOLDERS, undefined),
    createFolder: (input) => invoke(IPC_CHANNELS.PASSVAULT_CREATE_FOLDER, input),
    updateFolder: (input) => invoke(IPC_CHANNELS.PASSVAULT_UPDATE_FOLDER, input),
    deleteFolder: (id) => invoke(IPC_CHANNELS.PASSVAULT_DELETE_FOLDER, { id }),
    reorderFolders: (parentId, ids) =>
      invoke(IPC_CHANNELS.PASSVAULT_REORDER_FOLDERS, { parentId, ids }),
    reorderEntries: (folderId, ids) =>
      invoke(IPC_CHANNELS.PASSVAULT_REORDER_ENTRIES, { folderId, ids }),
    generatePassphrase: (options) => invoke(IPC_CHANNELS.PASSVAULT_GENERATE_PASSPHRASE, options),
    changeMasterPassword: (oldPassword, newPassword) =>
      invoke(IPC_CHANNELS.PASSVAULT_CHANGE_MASTER, { oldPassword, newPassword }),
    biometricEnable: () => invoke(IPC_CHANNELS.PASSVAULT_BIOMETRIC_ENABLE, undefined),
    biometricDisable: () => invoke(IPC_CHANNELS.PASSVAULT_BIOMETRIC_DISABLE, undefined),
    biometricUnlock: () => invoke(IPC_CHANNELS.PASSVAULT_BIOMETRIC_UNLOCK, undefined),
    recoveryEnable: () => invoke(IPC_CHANNELS.PASSVAULT_RECOVERY_ENABLE, undefined),
    recoveryDisable: () => invoke(IPC_CHANNELS.PASSVAULT_RECOVERY_DISABLE, undefined),
    recoveryUnlock: (code) => invoke(IPC_CHANNELS.PASSVAULT_RECOVERY_UNLOCK, { code }),
    exportVault: (password) => invoke(IPC_CHANNELS.PASSVAULT_EXPORT, { password }),
    importVault: (password) => invoke(IPC_CHANNELS.PASSVAULT_IMPORT, { password }),
    importBrowser: () => invoke(IPC_CHANNELS.PASSVAULT_IMPORT_BROWSER, undefined),
    findForOrigin: (origin) => invoke(IPC_CHANNELS.PASSVAULT_FIND_FOR_ORIGIN, { origin }),
  },
  window: {
    minimize: () => invoke(IPC_CHANNELS.WINDOW_MINIMIZE, undefined),
    maximize: () => invoke(IPC_CHANNELS.WINDOW_MAXIMIZE, undefined),
    close: () => invoke(IPC_CHANNELS.WINDOW_CLOSE, undefined),
  },
  shell: {
    openExternal: (url) => invoke(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, { url }),
  },
  events: {
    onSyncUpdated: (listener) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, payload: SyncUpdatedEvent): void => {
        listener(payload)
      }

      ipcRenderer.on(PRELOAD_EVENTS.SYNC_UPDATED, wrappedListener)
      return () => ipcRenderer.off(PRELOAD_EVENTS.SYNC_UPDATED, wrappedListener)
    },
    onReminderFired: (listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        payload: LocalNotification,
      ): void => {
        listener(payload)
      }

      ipcRenderer.on(PRELOAD_EVENTS.REMINDER_FIRED, wrappedListener)
      return () => ipcRenderer.off(PRELOAD_EVENTS.REMINDER_FIRED, wrappedListener)
    },
    onNotificationCreated: (listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        payload: LocalNotification,
      ): void => {
        listener(payload)
      }

      ipcRenderer.on(PRELOAD_EVENTS.NOTIFICATION_CREATED, wrappedListener)
      return () => ipcRenderer.off(PRELOAD_EVENTS.NOTIFICATION_CREATED, wrappedListener)
    },
    onOmniBrowserOpenTab: (listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        payload: OmniBrowserOpenTabEvent,
      ): void => {
        listener(payload)
      }

      ipcRenderer.on(PRELOAD_EVENTS.OMNIBROWSER_OPEN_TAB, wrappedListener)
      return () => ipcRenderer.off(PRELOAD_EVENTS.OMNIBROWSER_OPEN_TAB, wrappedListener)
    },
    onOmniBrowserShortcut: (listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        action: OmniBrowserShortcutAction,
      ): void => {
        listener(action)
      }

      ipcRenderer.on(PRELOAD_EVENTS.OMNIBROWSER_SHORTCUT, wrappedListener)
      return () => ipcRenderer.off(PRELOAD_EVENTS.OMNIBROWSER_SHORTCUT, wrappedListener)
    },
    onAppNavShortcut: (listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        action: AppNavShortcutAction,
      ): void => {
        listener(action)
      }

      ipcRenderer.on(PRELOAD_EVENTS.APP_NAV_SHORTCUT, wrappedListener)
      return () => ipcRenderer.off(PRELOAD_EVENTS.APP_NAV_SHORTCUT, wrappedListener)
    },
    onOmniBrowserInspect: (listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        payload: OmniBrowserInspectEvent,
      ): void => {
        listener(payload)
      }

      ipcRenderer.on(PRELOAD_EVENTS.OMNIBROWSER_INSPECT, wrappedListener)
      return () => ipcRenderer.off(PRELOAD_EVENTS.OMNIBROWSER_INSPECT, wrappedListener)
    },
    onOmnichatConnection: (listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        payload: OmnichatConnectionEvent,
      ): void => {
        listener(payload)
      }

      ipcRenderer.on(PRELOAD_EVENTS.OMNICHAT_CONNECTION, wrappedListener)
      return () => ipcRenderer.off(PRELOAD_EVENTS.OMNICHAT_CONNECTION, wrappedListener)
    },
    onOmnichatMessage: (listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        payload: OmnichatMessageEvent,
      ): void => {
        listener(payload)
      }

      ipcRenderer.on(PRELOAD_EVENTS.OMNICHAT_MESSAGE, wrappedListener)
      return () => ipcRenderer.off(PRELOAD_EVENTS.OMNICHAT_MESSAGE, wrappedListener)
    },
    onOmnichatPresence: (listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        payload: OmnichatPresenceEvent,
      ): void => {
        listener(payload)
      }

      ipcRenderer.on(PRELOAD_EVENTS.OMNICHAT_PRESENCE, wrappedListener)
      return () => ipcRenderer.off(PRELOAD_EVENTS.OMNICHAT_PRESENCE, wrappedListener)
    },
    onOmnichatGroup: (listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        payload: OmnichatGroupEvent,
      ): void => {
        listener(payload)
      }

      ipcRenderer.on(PRELOAD_EVENTS.OMNICHAT_GROUP, wrappedListener)
      return () => ipcRenderer.off(PRELOAD_EVENTS.OMNICHAT_GROUP, wrappedListener)
    },
    onOmnichatTyping: (listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        payload: OmnichatTypingEvent,
      ): void => {
        listener(payload)
      }

      ipcRenderer.on(PRELOAD_EVENTS.OMNICHAT_TYPING_IN, wrappedListener)
      return () => ipcRenderer.off(PRELOAD_EVENTS.OMNICHAT_TYPING_IN, wrappedListener)
    },
    onOmnichatReceipt: (listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        payload: OmnichatReceiptEvent,
      ): void => {
        listener(payload)
      }

      ipcRenderer.on(PRELOAD_EVENTS.OMNICHAT_RECEIPT_IN, wrappedListener)
      return () => ipcRenderer.off(PRELOAD_EVENTS.OMNICHAT_RECEIPT_IN, wrappedListener)
    },
    onOmnichatCallRing: (listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        payload: OmnichatCallRingEvent,
      ): void => {
        listener(payload)
      }

      ipcRenderer.on(PRELOAD_EVENTS.OMNICHAT_CALL_RING, wrappedListener)
      return () => ipcRenderer.off(PRELOAD_EVENTS.OMNICHAT_CALL_RING, wrappedListener)
    },
    onOmnichatCallState: (listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        payload: OmnichatCallStateEvent,
      ): void => {
        listener(payload)
      }

      ipcRenderer.on(PRELOAD_EVENTS.OMNICHAT_CALL_STATE, wrappedListener)
      return () => ipcRenderer.off(PRELOAD_EVENTS.OMNICHAT_CALL_STATE, wrappedListener)
    },
    onOmnichatReaction: (listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        payload: OmnichatReactionEvent,
      ): void => {
        listener(payload)
      }

      ipcRenderer.on(PRELOAD_EVENTS.OMNICHAT_REACTION, wrappedListener)
      return () => ipcRenderer.off(PRELOAD_EVENTS.OMNICHAT_REACTION, wrappedListener)
    },
    onOmnichatCallActive: (listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        payload: OmnichatCallActiveEvent,
      ): void => {
        listener(payload)
      }

      ipcRenderer.on(PRELOAD_EVENTS.OMNICHAT_CALL_ACTIVE, wrappedListener)
      return () => ipcRenderer.off(PRELOAD_EVENTS.OMNICHAT_CALL_ACTIVE, wrappedListener)
    },
    onPassvaultLocked: (listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        payload: PassVaultLockedEvent,
      ): void => {
        listener(payload)
      }

      ipcRenderer.on(PRELOAD_EVENTS.PASSVAULT_LOCKED, wrappedListener)
      return () => ipcRenderer.off(PRELOAD_EVENTS.PASSVAULT_LOCKED, wrappedListener)
    },
  },
}

import { defineStore } from 'pinia'
import { errorMessage } from '@shared/errors'
import { useBrowserStore } from '@renderer/stores/browserStore'
import { useOmnichatStore } from '@renderer/stores/omnichatStore'
import { readStoredAccent } from '@renderer/utils/accentColor'
import { readStoredBase } from '@renderer/utils/baseColor'
import { playNotificationSound } from '@renderer/utils/sounds'
import { compareVersions } from '@renderer/utils/version'
import {
  navActionToSlotIndex,
  resolveNavShortcuts,
  type AppNavShortcutAction,
} from '@shared/shortcuts'
import type { OmnideskApi } from '@preload/api'
import type { AppUpdateStatus, ChangelogEntry } from '@shared/ipc'
import type {
  AccountSummary,
  AppBootstrap,
  AttachmentSummary,
  ComposeMailRequest,
  ConnectImapAccountInput,
  ConnectWebpageAccountInput,
  ContactSummary,
  ConversationDetail,
  ConversationKind,
  ConversationSummary,
  CreateDraftAccountInput,
  LocalNotification,
  LocalStatus,
  MailAutodiscoverResult,
  MailFolderSummary,
  MessageReactionSummary,
  MessageSummary,
  OutgoingAttachment,
  ProviderDescriptor,
  ProviderKind,
  StartupView,
  UUID,
} from '@shared/models'

export type AppView =
  | 'home'
  | 'custom-home'
  | 'inbox'
  | 'notifications'
  | 'settings'
  | 'browser'
  | 'omnichat'
  | 'omnipass'

const startupToAppView = (view: StartupView): AppView => {
  switch (view) {
    case 'custom-home':
      return 'custom-home'
    case 'inbox':
      return 'inbox'
    case 'notifications':
      return 'notifications'
    default:
      return 'home'
  }
}
export type AccountWorkflowStep = 'closed' | 'choose-provider' | 'imap-form' | 'webpage-form'

export interface ConversationGroup {
  kind: ConversationKind | 'other'
  label: string
  conversations: ConversationSummary[]
}

export interface WebpageMediaState {
  audible: boolean
  paused: boolean
  muted: boolean
  volume: number
  title?: string
  artist?: string
  album?: string
  artworkUrl?: string
}

interface AppState {
  bootstrap?: AppBootstrap
  providers: ProviderDescriptor[]
  accounts: AccountSummary[]
  conversations: ConversationSummary[]
  selectedConversation?: ConversationDetail
  notifications: LocalNotification[]
  updateStatus: AppUpdateStatus
  changelogEntries: ChangelogEntry[]
  localStatus?: LocalStatus
  contacts: ContactSummary[]
  contactsLoadedForAccountId?: UUID
  imapFolders: Record<UUID, MailFolderSummary[]>
  imapFoldersLoadingFor?: UUID
  imapFolderSwitchingFor?: UUID
  imapLoadingMoreFor?: UUID
  composeOpen: boolean
  isLoading: boolean
  isWorking: boolean
  isLoadingContacts: boolean
  loadingConversationId?: UUID
  awaitingMessagesFor?: UUID
  activeView: AppView
  activeProviderId?: ProviderKind
  activeAccountId?: UUID
  accountWorkflowStep: AccountWorkflowStep
  actionFeedback?: string
  searchQuery: string
  unreadOnly: boolean
  startupView: StartupView
  // Couleur d'accent personnalisee (hex). La base fait autorite ; un miroir localStorage
  // evite le flash au demarrage. Appliquee au DOM par un watcher dans AppShell.
  accentColor: string
  // Couleur de fond personnalisee (hex de base ink-950). Le degrade ink complet en est
  // derive et applique au DOM par un watcher dans AppShell. Miroir localStorage anti-flash.
  baseColor: string
  // Overrides utilisateur des raccourcis de navigation (Cmd/Ctrl+1..9). Les defauts
  // sont fusionnes a la lecture via le getter resolvedNavShortcuts.
  navShortcuts: Partial<Record<AppNavShortcutAction, string>>
  error?: string
  webpageMedia: Record<UUID, WebpageMediaState>
  webpageMediaActiveId?: UUID
  // Non-lus par compte page web, deduits du titre de l'onglet (ex. "(3) Slack").
  webpageUnread: Record<UUID, number>
}

const KIND_LABELS: Record<ConversationKind | 'other', string> = {
  channel: 'Canaux',
  dm: 'Messages directs',
  group: 'Groupes prives',
  thread: 'Fils de discussion',
  mail: 'Boite mail',
  other: 'Autres',
}

const KIND_ORDER: Array<ConversationKind | 'other'> = [
  'channel',
  'dm',
  'group',
  'thread',
  'mail',
  'other',
]

let stopSyncListener: (() => void) | undefined
let stopNotificationListener: (() => void) | undefined
let stopShortcutListener: (() => void) | undefined
let stopNavShortcutListener: (() => void) | undefined
let stopInspectListener: (() => void) | undefined
let stopUpdateListener: (() => void) | undefined

const fallbackProviders = (): ProviderDescriptor[] => [
  {
    id: 'imap',
    name: 'imap',
    displayName: 'IMAP / SMTP',
    capabilities: ['password-auth', 'sync-conversations', 'sync-messages', 'send-message'],
    authReady: true,
  },
  {
    id: 'webpage',
    name: 'webpage',
    displayName: 'Page web',
    capabilities: ['embedded-webview'],
    authReady: true,
  },
]

const providerPriority: Record<ProviderKind, number> = {
  slack: 0,
  teams: 1,
  outlook: 2,
  imap: 3,
  webpage: 4,
  omnichat: 5,
}

const sortProviders = (providers: ProviderDescriptor[]): ProviderDescriptor[] =>
  [...providers].sort((left, right) => providerPriority[left.id] - providerPriority[right.id])

const safeCall = async <T>(
  factory: () => Promise<T>,
  fallbackMessage: string,
  timeoutMs = 2500,
): Promise<T> => withTimeout(factory(), fallbackMessage, timeoutMs)

const withTimeout = async <T>(
  promise: Promise<T>,
  fallbackMessage: string,
  timeoutMs = 2500,
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(fallbackMessage)), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

const fileToOutgoingAttachment = (file: File): Promise<OutgoingAttachment> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error(`Impossible de lire ${file.name}.`))
        return
      }

      const separator = result.indexOf(',')
      if (separator === -1) {
        reject(new Error(`Format inattendu pour ${file.name}.`))
        return
      }

      resolve({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        byteSize: file.size,
        bytesBase64: result.slice(separator + 1),
      })
    }
    reader.onerror = () => reject(reader.error ?? new Error(`Echec de lecture de ${file.name}.`))
    reader.readAsDataURL(file)
  })

const getApi = (): OmnideskApi | undefined => {
  const api = window.omnidesk

  if (!api?.app?.getBootstrap || !api?.settings?.getLocalStatus) {
    return undefined
  }

  return api
}

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    providers: [],
    accounts: [],
    conversations: [],
    notifications: [],
    updateStatus: { phase: 'idle' },
    changelogEntries: [],
    contacts: [],
    imapFolders: {},
    composeOpen: false,
    webpageMedia: {},
    webpageUnread: {},
    isLoading: true,
    isWorking: false,
    isLoadingContacts: false,
    activeView: 'home',
    accountWorkflowStep: 'closed',
    searchQuery: '',
    unreadOnly: false,
    startupView: 'default-home',
    // Initialisees depuis le cache renderer (derniere valeur connue) pour eviter tout
    // flash au demarrage ; la base les confirme ensuite via bootstrapApp.
    accentColor: readStoredAccent(),
    baseColor: readStoredBase(),
    navShortcuts: {},
  }),

  getters: {
    unreadNotificationCount: (state) =>
      state.notifications.filter((notification) => !notification.readAt).length,
    hasAccounts: (state) => state.accounts.length > 0,
    shouldShowHome: (state) => state.activeView === 'home' || state.activeView === 'custom-home',
    homeView: (state): AppView => (state.startupView === 'custom-home' ? 'custom-home' : 'home'),
    availableProviders: (state): ProviderDescriptor[] =>
      // omnichat (messagerie native) n'est pas un compte a "ajouter" : il a sa
      // propre vue dediee (bouton sous OmniBrowser). On l'exclut des listes de
      // providers ajoutables/affichables.
      (state.providers.length > 0 ? sortProviders(state.providers) : fallbackProviders()).filter(
        (provider) => provider.id !== 'omnichat',
      ),
    visibleProvider: (state) =>
      (state.providers.length > 0 ? sortProviders(state.providers) : fallbackProviders()).find(
        (provider) => provider.id === state.activeProviderId,
      ),
    connectedAccounts: (state): AccountSummary[] =>
      state.accounts.filter((account) => account.setupStatus === 'connected'),
    // Comptes affiches comme tuiles dans le rail, dans l'ordre d'affichage : ce sont
    // les "slots" cibles par les raccourcis Cmd/Ctrl+1..9. Le compte "self" omnichat
    // est un ancrage interne, jamais une tuile.
    slotAccounts(): AccountSummary[] {
      return this.connectedAccounts.filter((account) => account.providerId !== 'omnichat')
    },
    resolvedNavShortcuts: (state): Record<AppNavShortcutAction, string> =>
      resolveNavShortcuts(state.navShortcuts),
    activeAccount: (state): AccountSummary | undefined =>
      state.accounts.find((account) => account.id === state.activeAccountId),
    unreadByAccount: (state): Map<UUID, number> => {
      const counts = new Map<UUID, number>()

      for (const notification of state.notifications) {
        if (notification.readAt || !notification.accountId) {
          continue
        }

        // Les comptes page web sont comptes via le titre (ci-dessous), pas via leurs
        // notifications capturees : sinon on compterait deux fois le meme non-lu.
        if (notification.sourceProviderId === 'webpage') {
          continue
        }

        counts.set(notification.accountId, (counts.get(notification.accountId) ?? 0) + 1)
      }

      for (const conversation of state.conversations) {
        if (conversation.unreadCount > 0) {
          counts.set(
            conversation.accountId,
            (counts.get(conversation.accountId) ?? 0) + conversation.unreadCount,
          )
        }
      }

      // Pastille des pages web : reflet du compteur lu dans le titre (Slack/Teams...).
      for (const [accountId, count] of Object.entries(state.webpageUnread)) {
        if (count > 0) {
          counts.set(accountId, count)
        } else {
          counts.delete(accountId)
        }
      }

      return counts
    },
    // Total de non-lus tous comptes confondus : alimente la pastille du dock macOS.
    totalUnreadCount(): number {
      let total = 0
      for (const count of this.unreadByAccount.values()) {
        total += count
      }
      return total
    },
    visibleConversations: (state): ConversationSummary[] => {
      if (!state.activeAccountId) {
        return state.conversations
      }

      return state.conversations.filter(
        (conversation) => conversation.accountId === state.activeAccountId,
      )
    },
    conversationsByKind(): ConversationGroup[] {
      const conversations = this.visibleConversations
      const buckets = new Map<ConversationKind | 'other', ConversationSummary[]>()

      for (const conversation of conversations) {
        const bucketKey = conversation.kind ?? 'other'
        const bucket = buckets.get(bucketKey) ?? []
        bucket.push(conversation)
        buckets.set(bucketKey, bucket)
      }

      const groups: ConversationGroup[] = []

      for (const kind of KIND_ORDER) {
        const items = buckets.get(kind)
        if (!items || items.length === 0) {
          continue
        }

        const sorted = [...items].sort((left, right) => {
          const leftAt = left.lastMessageAt ?? ''
          const rightAt = right.lastMessageAt ?? ''
          return rightAt.localeCompare(leftAt)
        })

        groups.push({
          kind,
          label: KIND_LABELS[kind],
          conversations: sorted,
        })
      }

      return groups
    },
  },

  actions: {
    async checkForUpdates(): Promise<void> {
      await getApi()?.app.checkForUpdates()
    },

    async installUpdate(): Promise<void> {
      await getApi()?.app.installUpdate()
    },

    // Affiche la modal "Nouveautes" une seule fois apres une mise a jour : compare la
    // version installee a la derniere vue (localStorage). Premiere ouverture = on memorise
    // sans rien montrer ; sinon on montre les sections du changelog plus recentes.
    async maybeShowChangelog(version: string): Promise<void> {
      if (!version) {
        return
      }
      const STORAGE_KEY = 'omnidesk:lastSeenVersion'
      let lastSeen: string | null = null
      try {
        lastSeen = localStorage.getItem(STORAGE_KEY)
      } catch {
        return
      }

      if (lastSeen && compareVersions(version, lastSeen) > 0) {
        const since = lastSeen
        const api = getApi()
        const entries = api ? await api.app.getChangelog() : []
        this.changelogEntries = entries.filter(
          (entry) =>
            compareVersions(entry.version, since) > 0 &&
            compareVersions(entry.version, version) <= 0,
        )
      }

      try {
        localStorage.setItem(STORAGE_KEY, version)
      } catch {
        // localStorage indisponible : sans gravite, la modal repassera au prochain lancement.
      }
    },

    dismissChangelog(): void {
      this.changelogEntries = []
    },

    async bootstrapApp(): Promise<void> {
      this.isLoading = true
      this.error = undefined
      this.actionFeedback = undefined

      const api = getApi()
      if (!api) {
        this.providers = fallbackProviders()
        this.activeView = startupToAppView(this.startupView)
        this.actionFeedback = "L'accueil est pret. Vous pouvez deja ajouter votre premier service."
        this.isLoading = false
        return
      }

      stopSyncListener?.()
      stopSyncListener = api.events.onSyncUpdated(() => {
        void this.silentReload()
      })

      // Mise a jour applicative : l'indicateur pres de la cloche suit l'etat pousse par
      // le main, amorce avec le dernier etat connu (ex. MAJ deja prete au demarrage).
      stopUpdateListener?.()
      stopUpdateListener = api.events.onUpdateStatus((status) => {
        this.updateStatus = status
      })
      void api.app
        .getUpdateStatus()
        .then((status) => {
          this.updateStatus = status
        })
        .catch(() => {
          // Statut indisponible (ex. app non empaquetee) : on reste sur 'idle'.
        })

      // Notification hors Elodie : on joue le son dedie (PJ3). Les rappels (mascotte)
      // ne passent pas par cet evenement, ils gardent leur chirp (cf. main/index.ts).
      stopNotificationListener?.()
      stopNotificationListener = api.events.onNotificationCreated(() => {
        playNotificationSound()
      })

      // Initialise OmniBrowser (espaces + ecoute des popups -> nouvel onglet) des le
      // demarrage, meme si l'utilisateur n'ouvre pas encore le navigateur.
      const browserStore = useBrowserStore()
      void browserStore.initBrowser()

      // Raccourcis navigateur (menu applicatif cote main) routes vers la page/onglet actif.
      stopShortcutListener?.()
      stopShortcutListener = api.events.onOmniBrowserShortcut((action) => {
        switch (action) {
          case 'new-tab':
            this.setView('browser')
            void browserStore.newTabFromShortcut()
            break
          case 'focus-omnibox':
            this.setView('browser')
            browserStore.requestOmniboxFocus()
            break
          case 'reload':
            if (this.activeView === 'browser') {
              browserStore.reloadActiveTab()
            }
            break
          case 'hard-reload':
            if (this.activeView === 'browser') {
              browserStore.hardReloadActiveTab()
            }
            break
          case 'back':
            if (this.activeView === 'browser') {
              browserStore.backActiveTab()
            }
            break
          case 'forward':
            if (this.activeView === 'browser') {
              browserStore.forwardActiveTab()
            }
            break
          case 'close-tab':
            if (this.activeView === 'browser' && browserStore.activeTab) {
              void browserStore.closeTab(browserStore.activeTab.id)
            }
            break
          case 'toggle-sidebar':
            if (this.activeView === 'browser') {
              browserStore.toggleSidebar()
            }
            break
          case 'devtools':
            if (this.activeView === 'browser') {
              browserStore.openDevtoolsForActiveTab()
            }
            break
        }
      })

      // Clic droit "Inspecter" sur une page : DevTools embarquees (onglet OmniBrowser)
      // ou detachees (page web epinglee). Le store route selon la source.
      stopInspectListener?.()
      stopInspectListener = api.events.onOmniBrowserInspect((event) => {
        void browserStore.openDevtoolsForWebContents(event.sourceWebContentsId, event.x, event.y)
      })

      // Navigation entre apps (menu applicatif cote main) : Cmd/Ctrl+1..9 -> Nieme app.
      stopNavShortcutListener?.()
      stopNavShortcutListener = api.events.onAppNavShortcut((action) => {
        this.selectNavSlot(navActionToSlotIndex(action))
      })
      void this.loadNavShortcuts()

      try {
        const [
          bootstrapResult,
          providersResult,
          accountsResult,
          notificationsResult,
          conversationsResult,
          localStatusResult,
          startupViewResult,
          accentColorResult,
          baseColorResult,
        ] = await Promise.allSettled([
          safeCall(() => api.app.getBootstrap(), 'Le demarrage prend trop de temps.'),
          safeCall(() => api.providers.list(), 'La liste des services ne repond pas.'),
          safeCall(() => api.accounts.list(), 'La liste des comptes ne repond pas.'),
          safeCall(() => api.notifications.list(), 'Les notifications ne repondent pas.'),
          safeCall(() => api.conversations.list(), 'Les conversations ne repondent pas.'),
          safeCall(() => api.settings.getLocalStatus(), 'Les reglages ne repondent pas.'),
          safeCall(() => api.settings.getStartupView(), "La preference d'accueil ne repond pas."),
          safeCall(() => api.settings.getAccentColor(), "La couleur d'accent ne repond pas."),
          safeCall(() => api.settings.getBaseColor(), 'La couleur de fond ne repond pas.'),
        ])

        if (bootstrapResult.status === 'fulfilled') {
          this.bootstrap = bootstrapResult.value
          this.providers = sortProviders(bootstrapResult.value.providers)
          void this.maybeShowChangelog(bootstrapResult.value.appVersion)
        } else if (providersResult.status === 'fulfilled') {
          this.providers = sortProviders(providersResult.value)
        }

        this.accounts = accountsResult.status === 'fulfilled' ? accountsResult.value : []
        this.notifications =
          notificationsResult.status === 'fulfilled' ? notificationsResult.value : []
        this.conversations =
          conversationsResult.status === 'fulfilled' ? conversationsResult.value : []
        this.localStatus =
          localStatusResult.status === 'fulfilled' ? localStatusResult.value : undefined
        if (startupViewResult.status === 'fulfilled') {
          this.startupView = startupViewResult.value.view
        }
        if (accentColorResult.status === 'fulfilled') {
          this.accentColor = accentColorResult.value.color
        }
        if (baseColorResult.status === 'fulfilled') {
          this.baseColor = baseColorResult.value.color
        }
        this.activeView = startupToAppView(this.startupView)

        const hasCoreData =
          this.providers.length > 0 ||
          this.localStatus !== undefined ||
          this.bootstrap !== undefined

        if (!hasCoreData) {
          const primaryFailure =
            bootstrapResult.status === 'rejected'
              ? bootstrapResult.reason
              : providersResult.status === 'rejected'
                ? providersResult.reason
                : undefined

          this.error = errorMessage(primaryFailure, "Impossible d'ouvrir Omnidesk.")
        } else {
          const partialFailures = [
            accountsResult,
            notificationsResult,
            conversationsResult,
            localStatusResult,
          ].filter((result) => result.status === 'rejected').length

          if (partialFailures > 0) {
            this.actionFeedback =
              "L'application est ouverte. Certaines zones attendent encore leur premiere connexion."
          }
        }
      } catch (error) {
        this.providers = fallbackProviders()
        this.activeView = startupToAppView(this.startupView)
        this.error = undefined
        this.actionFeedback = errorMessage(
          error,
          "L'accueil est ouvert, mais certaines fonctions ne sont pas encore disponibles.",
        )
      } finally {
        this.isLoading = false
      }
    },

    setView(view: AppView): void {
      this.activeView = view === 'home' && this.startupView === 'custom-home' ? 'custom-home' : view
      this.actionFeedback = undefined
      if (this.activeView !== 'inbox') {
        this.activeAccountId = undefined
        this.selectedConversation = undefined
        void this.setFocusedConversation(null)
      }
    },

    async setStartupView(view: StartupView): Promise<void> {
      const previous = this.startupView
      this.startupView = view

      if (this.activeView === 'home' || this.activeView === 'custom-home') {
        this.activeView = view === 'custom-home' ? 'custom-home' : 'home'
      }

      const api = getApi()
      if (!api?.settings?.setStartupView) {
        return
      }

      try {
        await api.settings.setStartupView(view)
      } catch (error) {
        this.startupView = previous
        this.error = errorMessage(error, "Impossible d'enregistrer la preference d'accueil.")
      }
    },

    async setAccentColor(color: string): Promise<void> {
      const previous = this.accentColor
      // Mise a jour optimiste : le watcher d'AppShell applique aussitot la couleur au DOM.
      this.accentColor = color

      const api = getApi()
      if (!api?.settings?.setAccentColor) {
        return
      }

      try {
        await api.settings.setAccentColor(color)
      } catch (error) {
        this.accentColor = previous
        this.error = errorMessage(error, "Impossible d'enregistrer la couleur d'accent.")
      }
    },

    async setBaseColor(color: string): Promise<void> {
      const previous = this.baseColor
      // Mise a jour optimiste : le watcher d'AppShell applique aussitot le degrade au DOM.
      this.baseColor = color

      const api = getApi()
      if (!api?.settings?.setBaseColor) {
        return
      }

      try {
        await api.settings.setBaseColor(color)
      } catch (error) {
        this.baseColor = previous
        this.error = errorMessage(error, "Impossible d'enregistrer la couleur de fond.")
      }
    },

    // Sauvegarde complete chiffree : ouvre le selecteur de fichier cote main et ecrit l'archive.
    // Retourne true si un fichier a bien ete ecrit (false si l'utilisateur a annule).
    async exportBackup(password: string): Promise<boolean> {
      const api = getApi()
      if (!api?.settings?.exportBackup) {
        return false
      }
      this.error = undefined
      try {
        const { saved } = await api.settings.exportBackup(password)
        return saved
      } catch (error) {
        this.error = errorMessage(error, "Impossible d'exporter la sauvegarde.")
        return false
      }
    },

    // Restauration : le main remplace la base puis redemarre l'app. Si le mot de passe est
    // errone ou le fichier invalide, l'erreur remonte ici et rien n'est modifie.
    async importBackup(password: string): Promise<boolean> {
      const api = getApi()
      if (!api?.settings?.importBackup) {
        return false
      }
      this.error = undefined
      try {
        const { restored } = await api.settings.importBackup(password)
        return restored
      } catch (error) {
        this.error = errorMessage(error, 'Impossible de restaurer la sauvegarde.')
        return false
      }
    },

    async selectAccount(accountId?: UUID): Promise<void> {
      this.activeAccountId = accountId
      this.activeView = 'inbox'
      this.selectedConversation = undefined
      this.actionFeedback = undefined
      await this.setFocusedConversation(null)
      await this.refreshConversations()
    },

    // Active la Nieme tuile du rail (index 0-based). No-op si le slot est vide : un
    // raccourci peut viser une app inexistante (moins de N comptes connectes).
    selectNavSlot(index: number): void {
      if (index < 0) {
        return
      }
      const target = this.slotAccounts[index]
      if (target) {
        void this.selectAccount(target.id)
      }
    },

    async loadNavShortcuts(): Promise<void> {
      const api = getApi()
      if (!api?.settings?.getNavShortcuts) {
        return
      }
      try {
        const { shortcuts } = await api.settings.getNavShortcuts()
        this.navShortcuts = shortcuts
      } catch {
        // Non critique : on conserve les raccourcis par defaut.
      }
    },

    async persistNavShortcuts(
      shortcuts: Partial<Record<AppNavShortcutAction, string>>,
    ): Promise<void> {
      this.navShortcuts = shortcuts
      const api = getApi()
      if (!api?.settings?.setNavShortcuts) {
        return
      }
      try {
        const result = await api.settings.setNavShortcuts(shortcuts)
        this.navShortcuts = result.shortcuts
      } catch (error) {
        this.error = errorMessage(error, "Impossible d'enregistrer le raccourci.")
      }
    },

    async setNavShortcut(action: AppNavShortcutAction, accelerator: string): Promise<void> {
      await this.persistNavShortcuts({ ...this.navShortcuts, [action]: accelerator })
    },

    async resetNavShortcut(action: AppNavShortcutAction): Promise<void> {
      const next = { ...this.navShortcuts }
      delete next[action]
      await this.persistNavShortcuts(next)
    },

    async resetAllNavShortcuts(): Promise<void> {
      await this.persistNavShortcuts({})
    },

    async loadContactsFor(accountId: UUID): Promise<void> {
      const api = getApi()
      if (!api?.contacts?.list) {
        return
      }

      if (this.contactsLoadedForAccountId === accountId && this.contacts.length > 0) {
        return
      }

      this.isLoadingContacts = true
      try {
        this.contacts = await api.contacts.list(accountId)
        this.contactsLoadedForAccountId = accountId
      } catch (error) {
        this.error = errorMessage(error, "Impossible de charger l'annuaire.")
      } finally {
        this.isLoadingContacts = false
      }
    },

    async openDirectMessage(accountId: UUID, contactExternalId: string): Promise<void> {
      const api = getApi()
      if (!api?.conversations?.openDirect) {
        this.error = "L'ouverture d'un message direct n'est pas encore disponible."
        return
      }

      this.isWorking = true
      this.error = undefined

      try {
        const result = await api.conversations.openDirect(accountId, contactExternalId)
        this.activeAccountId = accountId
        this.activeView = 'inbox'
        await this.refreshConversations()
        await this.selectConversation(result.conversationId)
      } catch (error) {
        this.error = errorMessage(error, "Impossible d'ouvrir cette conversation.")
      } finally {
        this.isWorking = false
      }
    },

    async setFocusedConversation(conversationId: string | null): Promise<void> {
      const api = getApi()
      if (!api?.conversations?.focus) {
        return
      }

      try {
        await api.conversations.focus(conversationId)
      } catch {
        // Pas critique si le focus echoue.
      }
    },

    openAccountWorkflow(providerId?: ProviderKind): void {
      this.activeProviderId = providerId
      if (providerId === 'imap') {
        this.accountWorkflowStep = 'imap-form'
      } else if (providerId === 'webpage') {
        this.accountWorkflowStep = 'webpage-form'
      } else {
        this.accountWorkflowStep = 'choose-provider'
      }
      this.actionFeedback = undefined
    },

    closeAccountWorkflow(): void {
      this.accountWorkflowStep = 'closed'
      this.activeProviderId = undefined
    },

    async connectProvider(providerId: ProviderKind): Promise<void> {
      const api = getApi()
      if (!api) {
        this.providers = fallbackProviders()
      }

      this.activeProviderId = providerId

      if (providerId === 'imap') {
        this.accountWorkflowStep = 'imap-form'
        return
      }

      if (providerId === 'webpage') {
        this.accountWorkflowStep = 'webpage-form'
        return
      }

      this.accountWorkflowStep = 'choose-provider'
    },

    async createDraftAccount(input: CreateDraftAccountInput): Promise<void> {
      const api = getApi()
      if (!api?.accounts?.createDraft || !api?.accounts?.list) {
        this.error = "L'enregistrement du brouillon n'est pas encore disponible."
        return
      }

      this.isWorking = true
      this.error = undefined

      try {
        const account = await api.accounts.createDraft(input)
        this.accounts = await api.accounts.list()
        this.localStatus = await api.settings.getLocalStatus()
        this.actionFeedback = `${account.label} a ete enregistre comme brouillon local.`
        this.closeAccountWorkflow()
      } catch (error) {
        this.error = errorMessage(error, "Impossible d'enregistrer ce brouillon.")
      } finally {
        this.isWorking = false
      }
    },

    async autodiscoverImap(email: string): Promise<MailAutodiscoverResult | undefined> {
      const api = getApi()
      if (!api?.imap?.autodiscover) {
        this.error = "La detection automatique n'est pas disponible."
        return undefined
      }

      this.error = undefined
      try {
        return await api.imap.autodiscover(email)
      } catch (error) {
        this.error = errorMessage(error, 'La detection automatique a echoue.')
        return undefined
      }
    },

    async testImapConnection(
      input: ConnectImapAccountInput,
    ): Promise<{ ok: boolean; message?: string }> {
      const api = getApi()
      if (!api?.imap?.test) {
        return { ok: false, message: "Le test n'est pas disponible." }
      }

      try {
        await api.imap.test({
          password: input.password,
          imap: input.imap,
          smtp: input.smtp,
        })
        return { ok: true }
      } catch (error) {
        return { ok: false, message: errorMessage(error, 'Le test a echoue.') }
      }
    },

    async connectImapAccount(input: ConnectImapAccountInput): Promise<boolean> {
      const api = getApi()
      if (!api?.imap?.connect) {
        this.error = "La connexion IMAP n'est pas disponible."
        return false
      }

      this.isWorking = true
      this.error = undefined

      try {
        const account = await api.imap.connect(input)
        this.actionFeedback = `${account.label} est connecte.`
        this.closeAccountWorkflow()
        await this.reloadConnectedData()
        return true
      } catch (error) {
        this.error = errorMessage(error, "La connexion IMAP n'a pas abouti.")
        return false
      } finally {
        this.isWorking = false
      }
    },

    async loadImapFolders(accountId: UUID, force = false): Promise<void> {
      const api = getApi()
      if (!api?.imap?.listFolders) {
        return
      }

      if (!force && this.imapFolders[accountId]) {
        return
      }

      this.imapFoldersLoadingFor = accountId
      try {
        this.imapFolders[accountId] = await api.imap.listFolders(accountId)
      } catch (error) {
        this.error = errorMessage(error, 'Impossible de recuperer la liste des dossiers.')
      } finally {
        if (this.imapFoldersLoadingFor === accountId) {
          this.imapFoldersLoadingFor = undefined
        }
      }
    },

    async selectImapFolder(accountId: UUID, folderPath: string): Promise<void> {
      const api = getApi()
      if (!api?.imap?.selectFolder) {
        return
      }

      this.error = undefined
      const account = this.accounts.find((entry) => entry.id === accountId)
      if (account?.settings?.selectedFolder === folderPath) {
        return
      }

      this.conversations = this.conversations.filter((entry) => entry.accountId !== accountId)
      this.selectedConversation = undefined
      if (account) {
        account.settings = { ...(account.settings ?? {}), selectedFolder: folderPath }
      }
      this.imapFolderSwitchingFor = accountId

      try {
        await api.imap.selectFolder(accountId, folderPath)
        await this.refreshConversations()
      } catch (error) {
        this.error = errorMessage(error, 'Impossible de selectionner ce dossier.')
      } finally {
        if (this.imapFolderSwitchingFor === accountId) {
          this.imapFolderSwitchingFor = undefined
        }
      }
    },

    openCompose(): void {
      this.composeOpen = true
    },

    closeCompose(): void {
      this.composeOpen = false
    },

    async composeImapMail(input: Omit<ComposeMailRequest, 'accountId'>): Promise<boolean> {
      const api = getApi()
      const accountId = this.activeAccountId
      if (!api?.imap?.compose || !accountId) {
        this.error = "L'envoi n'est pas disponible."
        return false
      }

      this.isWorking = true
      this.error = undefined

      try {
        await api.imap.compose({ ...input, accountId })
        this.actionFeedback = 'Message envoye.'
        this.composeOpen = false
        await this.refreshAccount(accountId)
        return true
      } catch (error) {
        this.error = errorMessage(error, "L'envoi a echoue.")
        return false
      } finally {
        this.isWorking = false
      }
    },

    async deleteImapConversation(conversationId: UUID): Promise<boolean> {
      const api = getApi()
      if (!api?.imap?.deleteConversation) {
        this.error = "La suppression n'est pas disponible."
        return false
      }

      this.error = undefined
      const previousSelectedId = this.selectedConversation?.id
      this.conversations = this.conversations.filter((entry) => entry.id !== conversationId)
      if (previousSelectedId === conversationId) {
        this.selectedConversation = undefined
      }

      try {
        await api.imap.deleteConversation(conversationId)
        return true
      } catch (error) {
        this.error = errorMessage(error, 'La suppression a echoue.')
        await this.silentReload()
        return false
      }
    },

    async moveImapConversation(conversationId: UUID, folderPath: string): Promise<boolean> {
      const api = getApi()
      if (!api?.imap?.moveConversation) {
        this.error = "Le deplacement n'est pas disponible."
        return false
      }

      this.error = undefined
      const previousSelectedId = this.selectedConversation?.id
      this.conversations = this.conversations.filter((entry) => entry.id !== conversationId)
      if (previousSelectedId === conversationId) {
        this.selectedConversation = undefined
      }

      try {
        await api.imap.moveConversation(conversationId, folderPath)
        this.actionFeedback = 'Conversation deplacee.'
        return true
      } catch (error) {
        this.error = errorMessage(error, 'Le deplacement a echoue.')
        await this.silentReload()
        return false
      }
    },

    async markImapConversationUnread(conversationId: UUID, read: boolean): Promise<void> {
      const api = getApi()
      if (!api?.imap?.markRead) return

      const localConversation = this.conversations.find((entry) => entry.id === conversationId)
      try {
        await api.imap.markRead(conversationId, read)
        if (localConversation) {
          localConversation.unreadCount = read ? 0 : Math.max(localConversation.unreadCount, 1)
        }
      } catch (error) {
        this.error = errorMessage(error, "Impossible de modifier l'etat de lecture.")
      }
    },

    async loadMoreImapMessages(): Promise<number> {
      const api = getApi()
      const accountId = this.activeAccountId
      if (!api?.imap?.loadMore || !accountId) {
        return 0
      }
      if (this.imapLoadingMoreFor === accountId) {
        return 0
      }

      this.imapLoadingMoreFor = accountId
      try {
        const result = await api.imap.loadMore(accountId)
        if (result.inserted > 0) {
          await this.refreshConversations()
        }
        return result.inserted
      } catch (error) {
        this.error = errorMessage(error, 'Impossible de charger plus de messages.')
        return 0
      } finally {
        if (this.imapLoadingMoreFor === accountId) {
          this.imapLoadingMoreFor = undefined
        }
      }
    },

    async connectWebpageAccount(input: ConnectWebpageAccountInput): Promise<boolean> {
      const api = getApi()
      if (!api?.webpage?.connect) {
        this.error = "L'ajout d'une page web n'est pas disponible."
        return false
      }

      this.isWorking = true
      this.error = undefined

      try {
        const account = await api.webpage.connect(input)
        this.actionFeedback = `${account.label} est pret. Connectez-vous dans la page si necessaire.`
        this.closeAccountWorkflow()
        await this.reloadConnectedData()
        this.activeAccountId = account.id
        this.activeView = 'inbox'
        return true
      } catch (error) {
        this.error = errorMessage(error, "L'ajout de la page web n'a pas abouti.")
        return false
      } finally {
        this.isWorking = false
      }
    },

    async setWebpageKeepAlive(accountId: UUID, keepAlive: boolean): Promise<void> {
      const api = getApi()
      if (!api?.webpage?.setKeepAlive) {
        this.error = "Cette option n'est pas disponible."
        return
      }

      try {
        const updated = await api.webpage.setKeepAlive(accountId, keepAlive)
        const index = this.accounts.findIndex((account) => account.id === accountId)
        if (index !== -1) {
          this.accounts.splice(index, 1, updated)
        }
      } catch (error) {
        this.error = errorMessage(error, 'Impossible de changer cette option.')
      }
    },

    async setWebpageAdBlock(accountId: UUID, enabled: boolean): Promise<void> {
      const api = getApi()
      if (!api?.webpage?.setAdBlock) {
        this.error = "Cette option n'est pas disponible."
        return
      }

      try {
        const updated = await api.webpage.setAdBlock(accountId, enabled)
        const index = this.accounts.findIndex((account) => account.id === accountId)
        if (index !== -1) {
          this.accounts.splice(index, 1, updated)
        }
      } catch (error) {
        this.error = errorMessage(error, 'Impossible de changer le blocage des pubs.')
      }
    },

    async setWebpageFavicon(accountId: UUID, faviconUrl: string | null): Promise<void> {
      const api = getApi()
      if (!api?.webpage?.setFavicon) {
        return
      }

      const account = this.accounts.find((entry) => entry.id === accountId)
      if (!account) {
        return
      }
      const current = (account.settings as { faviconUrl?: string } | undefined)?.faviconUrl
      if (current === faviconUrl || (!current && !faviconUrl)) {
        return
      }

      try {
        const updated = await api.webpage.setFavicon(accountId, faviconUrl)
        const index = this.accounts.findIndex((entry) => entry.id === accountId)
        if (index !== -1) {
          this.accounts.splice(index, 1, updated)
        }
      } catch {
        // Pas critique si le favicon ne peut pas etre persistant.
      }
    },

    ensureWebpageMediaSlot(accountId: UUID): WebpageMediaState {
      const existing = this.webpageMedia[accountId]
      if (existing) {
        return existing
      }
      const fresh: WebpageMediaState = {
        audible: false,
        paused: true,
        muted: false,
        volume: 1,
      }
      this.webpageMedia = { ...this.webpageMedia, [accountId]: fresh }
      return fresh
    },

    setWebpageMediaState(accountId: UUID, patch: Partial<WebpageMediaState>): void {
      const current = this.ensureWebpageMediaSlot(accountId)
      const next: WebpageMediaState = { ...current, ...patch }
      this.webpageMedia = { ...this.webpageMedia, [accountId]: next }

      if (patch.audible === true) {
        this.webpageMediaActiveId = accountId
      } else if (patch.audible === false && this.webpageMediaActiveId === accountId) {
        const stillAudible = Object.entries(this.webpageMedia).find(
          ([id, state]) => id !== accountId && state.audible,
        )
        this.webpageMediaActiveId = stillAudible ? (stillAudible[0] as UUID) : accountId
      }
    },

    setWebpageMediaActive(accountId: UUID | undefined): void {
      this.webpageMediaActiveId = accountId
    },

    clearWebpageMedia(accountId: UUID): void {
      const next = { ...this.webpageMedia }
      delete next[accountId]
      this.webpageMedia = next
      if (this.webpageMediaActiveId === accountId) {
        this.webpageMediaActiveId = undefined
      }
    },

    // Compteur de non-lus d'une page web, deduit du titre de l'onglet (cf. WebpageView).
    setWebpageUnread(accountId: UUID, count: number): void {
      const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
      if (this.webpageUnread[accountId] === safe) {
        return
      }
      this.webpageUnread = { ...this.webpageUnread, [accountId]: safe }
    },

    // Notification captee dans une page web : on la persiste (centre + cloche). Le toast
    // systeme a deja ete affiche par la page elle-meme, on ne le redeclenche donc pas.
    async recordWebpageNotification(
      accountId: UUID,
      payload: { title: string; body?: string },
    ): Promise<void> {
      const api = getApi()
      const title = payload.title?.trim()
      if (!api?.webpage?.notify || !title) {
        return
      }

      try {
        const notification = await api.webpage.notify(accountId, title, payload.body)
        if (!this.notifications.some((entry) => entry.id === notification.id)) {
          this.notifications = [notification, ...this.notifications]
        }
      } catch {
        // Best-effort : la pastille deduite du titre reste la source fiable des non-lus.
      }
    },

    async refreshConversations(): Promise<void> {
      const api = getApi()
      if (!api?.conversations?.list) {
        return
      }

      this.conversations = await api.conversations.list({
        query: this.searchQuery || undefined,
        unreadOnly: this.unreadOnly || undefined,
      })
    },

    async selectConversation(conversationId: string): Promise<void> {
      const api = getApi()
      if (!api?.conversations?.get) {
        return
      }

      this.loadingConversationId = conversationId
      this.awaitingMessagesFor = conversationId
      setTimeout(() => {
        if (this.awaitingMessagesFor === conversationId) {
          this.awaitingMessagesFor = undefined
        }
      }, 12_000)

      try {
        const detail = await api.conversations.get(conversationId)
        if (this.loadingConversationId !== conversationId) {
          return
        }

        this.selectedConversation = detail ?? undefined
        void this.setFocusedConversation(conversationId)

        // IMAP : marquage cote serveur aussi (l'etat lu doit remonter au compte mail).
        if (detail?.providerId === 'imap' && api.imap?.markRead) {
          try {
            await api.imap.markRead(conversationId, true)
          } catch {
            // Pas critique si le marquage serveur echoue.
          }
        }

        // Marquage lu local generique (tous providers, omnichat compris) : remet a
        // zero les messages non lus ET les notifications de la conversation, puis MAJ
        // optimiste de la pastille sidebar + rafraichissement de la liste de notifs.
        try {
          if (api.conversations?.markRead) {
            await api.conversations.markRead(conversationId)
          }
          const localConversation = this.conversations.find(
            (conversation) => conversation.id === conversationId,
          )
          if (localConversation) {
            localConversation.unreadCount = 0
          }
          if (api.notifications?.list) {
            this.notifications = await api.notifications.list()
          }
        } catch {
          // Pas critique si le marquage echoue.
        }
      } finally {
        if (this.loadingConversationId === conversationId) {
          this.loadingConversationId = undefined
        }
      }
    },

    async sendMessage(body: string, files: File[] = []): Promise<void> {
      const trimmed = body.trim()
      if (!trimmed && files.length === 0) {
        return
      }

      const api = getApi()
      const conversation = this.selectedConversation
      if (!api?.messages?.send || !conversation) {
        this.error = "L'envoi n'est pas encore disponible."
        return
      }

      let outgoing: OutgoingAttachment[] = []
      let optimisticAttachments: AttachmentSummary[] = []

      if (files.length > 0) {
        try {
          outgoing = await Promise.all(files.map(fileToOutgoingAttachment))
        } catch (error) {
          this.error = errorMessage(error, 'Impossible de lire les fichiers selectionnes.')
          throw error
        }

        optimisticAttachments = files.map((file, index) => ({
          id: `optimistic-att:${index}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          byteSize: file.size,
        }))
      }

      const optimisticId = `optimistic:${Date.now()}:${Math.random().toString(36).slice(2)}`
      const sentAt = new Date().toISOString()
      const optimistic: MessageSummary = {
        id: optimisticId,
        providerId: conversation.providerId,
        conversationId: conversation.id,
        externalMessageId: optimisticId,
        direction: 'outgoing',
        senderName: 'Moi',
        bodyPreview: trimmed ? trimmed.slice(0, 280) : undefined,
        sentAt,
        state: 'read',
        attachments: optimisticAttachments.length > 0 ? optimisticAttachments : undefined,
      }

      conversation.messages.push(optimistic)
      this.error = undefined

      try {
        // Les conversations natives omnichat passent par le WebSocket temps reel
        // (api.omnichat.send) et non par l'envoi provider classique. Les pieces
        // jointes ne sont pas encore supportees pour omnichat (texte seulement).
        const saved =
          conversation.providerId === 'omnichat'
            ? await api.omnichat.send(conversation.id, trimmed)
            : await api.messages.send({
                conversationId: conversation.id,
                body: trimmed,
                attachments: outgoing.length > 0 ? outgoing : undefined,
              })

        const current = this.selectedConversation
        if (current?.id === conversation.id) {
          const index = current.messages.findIndex((message) => message.id === optimisticId)
          if (index !== -1) {
            current.messages.splice(index, 1, saved)
          } else if (!current.messages.some((message) => message.id === saved.id)) {
            current.messages.push(saved)
          }
        }

        this.actionFeedback =
          conversation.providerId === 'imap' ? 'Reponse envoyee.' : 'Message envoye.'
        if (conversation.providerId === 'omnichat') {
          const omnichatStore = useOmnichatStore()
          omnichatStore.markOutgoingSent(conversation.id)
          omnichatStore.stopTypingNow(conversation.id)
        }
        void this.refreshConversations()
      } catch (error) {
        const current = this.selectedConversation
        if (current?.id === conversation.id) {
          const index = current.messages.findIndex((message) => message.id === optimisticId)
          if (index !== -1) {
            current.messages.splice(index, 1)
          }
        }
        this.error = errorMessage(error, "L'envoi du message a echoue.")
        throw error
      }
    },

    async toggleReaction(messageId: UUID, name: string): Promise<void> {
      const api = getApi()
      const conversation = this.selectedConversation
      if (!api?.messages?.toggleReaction || !conversation) {
        return
      }

      const message = conversation.messages.find((entry) => entry.id === messageId)
      if (!message) {
        return
      }

      const snapshot: MessageReactionSummary[] | undefined = message.reactions
        ? message.reactions.map((reaction) => ({ ...reaction }))
        : undefined

      const draftReactions: MessageReactionSummary[] = message.reactions
        ? message.reactions.map((reaction) => ({ ...reaction }))
        : []
      const existing = draftReactions.find((reaction) => reaction.name === name)
      const isAdding = !existing?.mine

      if (isAdding) {
        if (existing) {
          existing.count += 1
          existing.mine = true
        } else {
          draftReactions.push({ name, count: 1, mine: true })
        }
      } else if (existing) {
        existing.count = Math.max(0, existing.count - 1)
        existing.mine = false
      }

      const cleaned = draftReactions.filter((reaction) => reaction.count > 0)
      message.reactions = cleaned.length > 0 ? cleaned : undefined
      this.error = undefined

      try {
        const updated = await api.messages.toggleReaction({
          messageId,
          name,
          enabled: isAdding,
        })

        const current = this.selectedConversation?.messages.find((entry) => entry.id === messageId)
        if (current) {
          current.reactions = updated.length > 0 ? updated : undefined
        }
      } catch (error) {
        message.reactions = snapshot
        this.error = errorMessage(error, "L'action sur la reaction a echoue.")
        throw error
      }
    },

    async markNotificationRead(notificationId: string): Promise<void> {
      const api = getApi()
      if (!api?.notifications?.markRead || !api?.notifications?.list) {
        return
      }

      await api.notifications.markRead(notificationId)
      this.notifications = await api.notifications.list()
    },

    async clearAllNotifications(): Promise<void> {
      const api = getApi()
      if (!api?.notifications?.clearAll) {
        this.notifications = []
        return
      }

      const previous = this.notifications
      this.notifications = []

      try {
        await api.notifications.clearAll()
        await this.refreshConversations()
      } catch (error) {
        this.notifications = previous
        this.error = errorMessage(error, "Impossible d'effacer les notifications.")
        throw error
      }
    },

    async refreshAccount(accountId: string): Promise<void> {
      const api = getApi()
      if (!api?.accounts?.refresh) {
        this.error = "La synchronisation n'est pas encore disponible."
        return
      }

      this.isWorking = true
      this.error = undefined

      try {
        const summary = await api.accounts.refresh(accountId)
        this.actionFeedback = `${summary.conversations} conversations, ${summary.messages} messages mis a jour.`
        await this.reloadConnectedData()
      } catch (error) {
        this.error = errorMessage(error, "La synchronisation n'a pas abouti.")
      } finally {
        this.isWorking = false
      }
    },

    async disconnectAccount(accountId: string): Promise<void> {
      const api = getApi()
      if (!api?.accounts?.disconnect) {
        this.error = "La deconnexion n'est pas encore disponible."
        return
      }

      this.isWorking = true
      this.error = undefined

      try {
        await api.accounts.disconnect(accountId)
        this.actionFeedback = 'Le compte a ete deconnecte.'
        this.selectedConversation = undefined
        await this.reloadConnectedData()
      } catch (error) {
        this.error = errorMessage(error, "La deconnexion n'a pas abouti.")
      } finally {
        this.isWorking = false
      }
    },

    async reorderAccounts(orderedIds: UUID[]): Promise<void> {
      const api = getApi()
      if (!api?.accounts?.reorder) {
        return
      }

      // Mise a jour optimiste : on reordonne en memoire pour un retour visuel immediat,
      // puis on persiste. Le serveur renvoie la liste faisant foi (positions normalisees).
      const byId = new Map(this.accounts.map((account) => [account.id, account]))
      const reordered = orderedIds
        .map((id) => byId.get(id))
        .filter((account): account is AccountSummary => account !== undefined)
      const remaining = this.accounts.filter((account) => !orderedIds.includes(account.id))
      this.accounts = [...reordered, ...remaining]

      try {
        this.accounts = await api.accounts.reorder(orderedIds)
      } catch (error) {
        this.error = errorMessage(error, "Le reordonnancement des comptes n'a pas abouti.")
        this.accounts = await api.accounts.list()
      }
    },

    async reloadConnectedData(): Promise<void> {
      const api = getApi()
      if (!api) {
        return
      }

      this.isWorking = true

      try {
        const [accounts, conversations, notifications, localStatus, providers] = await Promise.all([
          api.accounts.list(),
          api.conversations.list(),
          api.notifications.list(),
          api.settings.getLocalStatus(),
          api.providers.list(),
        ])

        this.accounts = accounts
        this.conversations = conversations
        this.notifications = notifications
        this.localStatus = localStatus
        this.providers = sortProviders(providers)
        this.activeView =
          this.accounts.length > 0 || this.conversations.length > 0 ? 'inbox' : 'home'
      } finally {
        this.isWorking = false
      }
    },

    async silentReload(): Promise<void> {
      const api = getApi()
      if (!api) {
        return
      }

      try {
        const [accounts, conversations, notifications] = await Promise.all([
          api.accounts.list(),
          api.conversations.list({
            query: this.searchQuery || undefined,
            unreadOnly: this.unreadOnly || undefined,
          }),
          api.notifications.list(),
        ])

        this.accounts = accounts
        this.conversations = conversations
        this.notifications = notifications

        if (this.selectedConversation) {
          const refreshed = await api.conversations.get(this.selectedConversation.id)
          if (refreshed) {
            this.selectedConversation = refreshed
            if (this.awaitingMessagesFor === refreshed.id) {
              this.awaitingMessagesFor = undefined
            }
          }
        }
      } catch {
        // Background reload — silencieux, l'app continue avec l'etat actuel.
      }
    },
  },
})

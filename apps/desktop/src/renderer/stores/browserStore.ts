import { defineStore } from 'pinia'
import { errorMessage } from '@shared/errors'
import type {
  BrowserBookmark,
  BrowserBookmarkCategory,
  BrowserCredential,
  BrowserExtension,
  BrowserHistoryEntry,
  BrowserSpace,
  BrowserTabGroup,
  OmniBrowserSettings,
  OmniboxSuggestion,
  UUID,
} from '@shared/models'
import type { OmniBrowserOpenTabEvent } from '@shared/ipc'
import {
  buildSearchUrl,
  CUSTOM_SEARCH_ENGINE_ID,
  DEFAULT_SEARCH_ENGINE,
} from '@shared/searchEngines'
import { resolveShortcuts, type OmniBrowserShortcutAction } from '@shared/shortcuts'
import { browserTabController } from '@renderer/services/browserTabController'
import { webpageController } from '@renderer/services/webpageController'

// Etat d'execution d'un onglet (fusionne le modele persiste et l'etat vivant du webview).
export interface BrowserTabView {
  id: UUID
  spaceId: UUID
  groupId?: UUID | null
  // Onglet de navigation privee : session ephemere (partition non persistee), pas d'historique.
  isPrivate: boolean
  // URL courante (derniere navigation validee). '' tant que l'onglet est une page d'accueil.
  url: string
  // src liee UNE seule fois au montage du webview. '' => on affiche la start-page, pas de webview.
  initialUrl: string
  title: string
  // Surnom defini par l'utilisateur. Prioritaire sur `title` a l'affichage ; null => titre de page.
  customTitle: string | null
  faviconUrl?: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  audible: boolean
  muted: boolean
  crashed: boolean
  isPinned: boolean
  // false tant que l'onglet n'a pas d'URL reelle (start-page non persistee en base).
  persisted: boolean
}

// Proposition d'enregistrement d'identifiants en attente (bandeau). Le mot de passe est
// transitoire (vide des que l'utilisateur enregistre ou ignore) et n'est jamais journalise.
interface CredentialPrompt {
  tabId: UUID
  origin: string
  username: string
  password: string
}

interface BrowserState {
  initialized: boolean
  spaces: BrowserSpace[]
  activeSpaceId?: UUID
  tabs: BrowserTabView[]
  tabGroups: BrowserTabGroup[]
  activeTabId?: UUID
  privateMode: boolean
  // Memorise le dernier onglet actif par mode pour restaurer au basculement du toggle.
  activeIdByMode: { normal?: UUID; private?: UUID }
  categories: BrowserBookmarkCategory[]
  bookmarks: BrowserBookmark[]
  history: BrowserHistoryEntry[]
  extensions: BrowserExtension[]
  settings: OmniBrowserSettings
  omniboxQuery: string
  omniboxSuggestions: OmniboxSuggestion[]
  omniboxOpen: boolean
  omniboxFocusToken: number
  // Onglet dont les DevTools sont ouvertes dans le panneau dockable (un seul a la fois).
  devtoolsTabId?: UUID
  // Coordonnees d'inspection en attente (clic droit "Inspecter"), appliquees a l'attache.
  devtoolsPending?: { x: number; y: number }
  // Identifiants enregistres (alimente la page de gestion dans les reglages).
  credentials: BrowserCredential[]
  // Proposition d'enregistrement en attente (bandeau au-dessus de la page).
  credentialPrompt?: CredentialPrompt
  error?: string
}

const looksLikeUrl = (value: string): boolean => {
  const trimmed = value.trim()
  if (trimmed.length === 0 || /\s/.test(trimmed)) {
    return false
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return true
  }
  if (trimmed.startsWith('localhost') || trimmed.startsWith('127.0.0.1')) {
    return true
  }
  return /^[^\s.]+\.[^\s.]+/.test(trimmed)
}

const resolveOmniboxInput = (input: string, settings: OmniBrowserSettings): string => {
  const trimmed = input.trim()
  if (looksLikeUrl(trimmed)) {
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  }
  return buildSearchUrl(settings, trimmed)
}

const api = () => window.omnidesk?.omnibrowser
const newId = (): UUID => crypto.randomUUID()

let stopOpenTabListener: (() => void) | undefined
const historyTimers = new Map<UUID, ReturnType<typeof setTimeout>>()
const lastRecordedUrl = new Map<UUID, string>()
// Dernier identifiant auto-rempli par onglet : evite de reproposer l'enregistrement d'un couple
// deja connu (ce qu'on vient de remplir). Memoire de session uniquement, jamais persistee.
const lastFilledByTab = new Map<UUID, { username: string; password: string }>()
let suggestSeq = 0

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })

// Origine http(s) d'une URL d'onglet, ou null (start-page, about:blank, schema non gere).
const credentialOrigin = (url: string): string | null => {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null
    }
    return parsed.origin
  } catch {
    return null
  }
}

export const useBrowserStore = defineStore('browser', {
  state: (): BrowserState => ({
    initialized: false,
    spaces: [],
    tabs: [],
    tabGroups: [],
    categories: [],
    bookmarks: [],
    history: [],
    extensions: [],
    credentials: [],
    credentialPrompt: undefined,
    privateMode: false,
    activeIdByMode: {},
    settings: { searchEngineId: DEFAULT_SEARCH_ENGINE.id, sidebarCollapsed: false },
    omniboxQuery: '',
    omniboxSuggestions: [],
    omniboxOpen: false,
    omniboxFocusToken: 0,
  }),

  getters: {
    activeSpace: (state): BrowserSpace | undefined =>
      state.spaces.find((space) => space.id === state.activeSpaceId),
    activeTab: (state): BrowserTabView | undefined =>
      state.tabs.find((tab) => tab.id === state.activeTabId),
    // Accelerateurs effectifs (defauts + overrides), pour l'UI de mappage.
    resolvedShortcuts: (state): Record<OmniBrowserShortcutAction, string> =>
      resolveShortcuts(state.settings.shortcuts),
    // Onglets affiches dans la barre laterale selon le mode courant (normal vs prive).
    visibleTabs: (state): BrowserTabView[] =>
      state.tabs.filter((tab) => Boolean(tab.isPrivate) === state.privateMode),
    ungroupedTabs: (state): BrowserTabView[] =>
      state.tabs.filter((tab) => !tab.isPrivate && !tab.groupId),
    tabsInGroup:
      (state) =>
      (groupId: UUID): BrowserTabView[] =>
        state.tabs.filter((tab) => !tab.isPrivate && tab.groupId === groupId),
    bookmarksByCategory: (state) => {
      const groups = new Map<UUID | 'uncategorized', BrowserBookmark[]>()
      for (const bookmark of state.bookmarks) {
        const key = bookmark.categoryId ?? 'uncategorized'
        const bucket = groups.get(key) ?? []
        bucket.push(bookmark)
        groups.set(key, bucket)
      }
      return groups
    },
  },

  actions: {
    async initBrowser(): Promise<void> {
      const browser = api()
      if (!browser) {
        return
      }

      if (!stopOpenTabListener) {
        stopOpenTabListener = window.omnidesk?.events.onOmniBrowserOpenTab((event) => {
          void this.handleOpenTab(event)
        })
      }

      if (this.initialized) {
        return
      }

      try {
        const [spaces, settings] = await Promise.all([browser.spaces.list(), browser.settings.get()])
        this.spaces = spaces
        this.settings = settings
        const active = this.spaces.find((space) => space.isActive) ?? this.spaces[0]
        if (active) {
          await this.loadSpace(active.id)
        }
        this.initialized = true
      } catch (error) {
        this.error = errorMessage(error, 'Impossible de charger OmniBrowser.')
      }
    },

    async loadSpace(spaceId: UUID): Promise<void> {
      const browser = api()
      if (!browser) {
        return
      }

      this.activeSpaceId = spaceId
      const [tabs, groups, categories, bookmarks] = await Promise.all([
        browser.tabs.list(spaceId),
        browser.tabGroups.list(spaceId),
        browser.categories.list(spaceId),
        browser.bookmarks.list(spaceId),
      ])

      this.tabGroups = groups
      this.categories = categories
      this.bookmarks = bookmarks
      // On conserve les onglets prives (ephemeres, hors base) lors d'un changement d'espace.
      const privateTabs = this.tabs.filter((tab) => tab.isPrivate)
      const normalTabs = tabs.map((tab) => ({
        id: tab.id,
        spaceId: tab.spaceId,
        groupId: tab.groupId ?? null,
        isPrivate: false,
        url: tab.url,
        initialUrl: tab.url,
        title: tab.title ?? '',
        customTitle: tab.customTitle ?? null,
        faviconUrl: tab.faviconUrl,
        isLoading: true,
        canGoBack: false,
        canGoForward: false,
        audible: false,
        muted: false,
        crashed: false,
        isPinned: tab.isPinned,
        persisted: true,
      }))
      this.tabs = [...normalTabs, ...privateTabs]

      // En mode prive, on garde l'onglet prive actif ; sinon on (re)selectionne un onglet normal.
      if (!this.privateMode) {
        const activeTab = tabs.find((tab) => tab.isActive) ?? tabs[0]
        if (activeTab) {
          this.activeTabId = activeTab.id
        } else {
          this.activeTabId = undefined
          await this.openTab('')
        }
      }
    },

    async switchSpace(spaceId: UUID): Promise<void> {
      if (spaceId === this.activeSpaceId) {
        return
      }
      const browser = api()
      await browser?.spaces.setActive(spaceId)
      this.spaces = this.spaces.map((space) => ({ ...space, isActive: space.id === spaceId }))
      await this.loadSpace(spaceId)
    },

    async createSpace(name: string): Promise<void> {
      const browser = api()
      if (!browser) {
        return
      }
      const space = await browser.spaces.create({ name })
      this.spaces = await browser.spaces.list()
      await this.switchSpace(space.id)
    },

    async renameSpace(id: UUID, name: string): Promise<void> {
      const browser = api()
      if (!browser) {
        return
      }
      const updated = await browser.spaces.update({ id, name })
      this.spaces = this.spaces.map((space) => (space.id === id ? updated : space))
    },

    async deleteSpace(id: UUID): Promise<void> {
      const browser = api()
      if (!browser) {
        return
      }
      await browser.spaces.delete(id)
      this.spaces = await browser.spaces.list()
      if (this.activeSpaceId === id) {
        const next = this.spaces[0]
        if (next) {
          await this.switchSpace(next.id)
        }
      }
    },

    async setSpaceAdBlock(enabled: boolean): Promise<void> {
      const browser = api()
      const spaceId = this.activeSpaceId
      if (!browser || !spaceId) {
        return
      }
      const updated = await browser.spaces.setAdBlock(spaceId, enabled)
      this.spaces = this.spaces.map((space) => (space.id === spaceId ? updated : space))
      this.reloadActiveTab()
    },

    // --- Onglets -----------------------------------------------------------

    async openTab(url = '', options: { activate?: boolean } = {}): Promise<void> {
      const spaceId = this.activeSpaceId
      if (!spaceId) {
        return
      }
      const trimmed = url.trim()
      const tab: BrowserTabView = {
        id: newId(),
        spaceId,
        groupId: null,
        isPrivate: this.privateMode,
        url: trimmed,
        initialUrl: trimmed,
        title: '',
        customTitle: null,
        faviconUrl: undefined,
        isLoading: trimmed.length > 0,
        canGoBack: false,
        canGoForward: false,
        audible: false,
        muted: false,
        crashed: false,
        isPinned: false,
        persisted: false,
      }
      this.tabs.push(tab)
      if (options.activate !== false) {
        this.activeTabId = tab.id
      }
      if (trimmed.length > 0) {
        await this.persistTab(tab)
      }
    },

    async closeTab(tabId: UUID): Promise<void> {
      const index = this.tabs.findIndex((tab) => tab.id === tabId)
      if (index === -1) {
        return
      }
      // L'onglet (et son guest) est detruit : ses DevTools se ferment d'office.
      if (this.devtoolsTabId === tabId) {
        this.devtoolsTabId = undefined
        this.devtoolsPending = undefined
      }
      const [removed] = this.tabs.splice(index, 1)
      browserTabController.unregister(tabId)
      historyTimers.delete(tabId)
      lastRecordedUrl.delete(tabId)
      lastFilledByTab.delete(tabId)

      if (removed?.persisted) {
        await api()?.tabs.close(tabId)
      }

      if (this.activeTabId === tabId) {
        const wasPrivate = removed?.isPrivate ?? this.privateMode
        const siblings = this.tabs.filter((tab) => Boolean(tab.isPrivate) === Boolean(wasPrivate))
        const neighbour = siblings[0]
        if (neighbour) {
          await this.activateTab(neighbour.id)
        } else {
          this.activeTabId = undefined
          await this.openTab('')
        }
      }
    },

    async activateTab(tabId: UUID): Promise<void> {
      this.activeTabId = tabId
      const tab = this.tabs.find((entry) => entry.id === tabId)
      if (tab) {
        this.activeIdByMode[tab.isPrivate ? 'private' : 'normal'] = tabId
      }
      if (tab?.persisted && this.activeSpaceId) {
        await api()?.tabs.setActive(this.activeSpaceId, tabId)
      }
    },

    async togglePrivateMode(): Promise<void> {
      // Memorise l'onglet actif du mode quitte, puis restaure celui du mode cible.
      this.activeIdByMode[this.privateMode ? 'private' : 'normal'] = this.activeTabId
      this.privateMode = !this.privateMode
      const remembered = this.activeIdByMode[this.privateMode ? 'private' : 'normal']
      const target = this.visibleTabs.find((tab) => tab.id === remembered) ?? this.visibleTabs[0]
      if (target) {
        this.activeTabId = target.id
      } else {
        await this.openTab('')
      }
    },

    async navigateActiveTab(input: string): Promise<void> {
      const tab = this.activeTab
      if (!tab) {
        return
      }
      const finalUrl = resolveOmniboxInput(input, this.settings)
      this.omniboxOpen = false
      this.omniboxSuggestions = []
      await this.navigateTab(tab, finalUrl)
    },

    async navigateTab(tab: BrowserTabView, finalUrl: string): Promise<void> {
      tab.url = finalUrl
      tab.isLoading = true
      tab.crashed = false
      if (tab.initialUrl === '') {
        // Premiere navigation d'une start-page : on monte le webview avec cette src.
        tab.initialUrl = finalUrl
      } else {
        void browserTabController.loadURL(tab.id, finalUrl)
      }
      await this.persistTab(tab)
    },

    reloadActiveTab(): void {
      const tab = this.activeTab
      if (tab && tab.initialUrl !== '') {
        browserTabController.reload(tab.id)
      }
    },

    hardReloadActiveTab(): void {
      const tab = this.activeTab
      if (tab && tab.initialUrl !== '') {
        browserTabController.hardReload(tab.id)
      }
    },

    openUrl(url: string): void {
      const tab = this.activeTab
      if (tab && tab.initialUrl === '') {
        void this.navigateTab(tab, url)
      } else {
        void this.openTab(url, { activate: true })
      }
    },

    // --- DevTools dockables -------------------------------------------------

    // Depuis le clic droit "Inspecter". Onglet OmniBrowser => panneau embarque ;
    // page web epinglee (source inconnue ici) => DevTools detachees en repli.
    openDevtoolsForWebContents(sourceWebContentsId: number, x?: number, y?: number): void {
      const tabId = browserTabController.tabIdForWebContents(sourceWebContentsId)
      if (!tabId) {
        // Source hors OmniBrowser (page web epinglee) : DevTools detachees.
        if (typeof x === 'number' && typeof y === 'number') {
          void api()?.devtools.inspectDetached(sourceWebContentsId, x, y)
        }
        return
      }
      // Le changement de cible est gere par l'hote (reutilise la meme vue native).
      this.devtoolsPending = typeof x === 'number' && typeof y === 'number' ? { x, y } : undefined
      this.devtoolsTabId = tabId
      if (this.activeTabId !== tabId) {
        void this.activateTab(tabId)
      }
    },

    openDevtoolsForActiveTab(): void {
      const tab = this.activeTab
      if (!tab || tab.initialUrl === '') {
        return
      }
      this.devtoolsPending = undefined
      this.devtoolsTabId = tab.id
    },

    // Appele par le panneau (placeholder) une fois ses dimensions connues. La vue DevTools
    // native (WebContentsView) est creee/positionnee cote main a ces dimensions.
    attachDevtools(bounds: { x: number; y: number; width: number; height: number }): void {
      const tabId = this.devtoolsTabId
      if (!tabId) {
        return
      }
      const guestWebContentsId = browserTabController.getWebContentsId(tabId)
      if (guestWebContentsId === undefined) {
        return
      }
      const pending = this.devtoolsPending
      void api()?.devtools.attach({
        guestWebContentsId,
        bounds,
        inspectX: pending?.x,
        inspectY: pending?.y,
      })
      this.devtoolsPending = undefined
    },

    updateDevtoolsBounds(
      bounds: { x: number; y: number; width: number; height: number },
      visible: boolean,
    ): void {
      void api()?.devtools.setBounds({ bounds, visible })
    },

    closeDevtools(): void {
      const tabId = this.devtoolsTabId
      if (tabId) {
        const guestWebContentsId = browserTabController.getWebContentsId(tabId)
        if (guestWebContentsId !== undefined) {
          void api()?.devtools.detach(guestWebContentsId)
        }
      }
      this.devtoolsTabId = undefined
      this.devtoolsPending = undefined
    },

    backActiveTab(): void {
      const tab = this.activeTab
      if (tab) {
        browserTabController.goBack(tab.id)
      }
    },

    forwardActiveTab(): void {
      const tab = this.activeTab
      if (tab) {
        browserTabController.goForward(tab.id)
      }
    },

    toggleMuteTab(tabId: UUID): void {
      const tab = this.tabs.find((entry) => entry.id === tabId)
      if (!tab) {
        return
      }
      const next = !tab.muted
      browserTabController.setAudioMuted(tabId, next)
      tab.muted = next
    },

    // Renomme un onglet (surnom utilisateur). Une valeur vide efface l'override : retour au titre de page.
    async renameTab(tabId: UUID, title: string): Promise<void> {
      const tab = this.tabs.find((entry) => entry.id === tabId)
      if (!tab) {
        return
      }
      const trimmed = title.trim()
      const next = trimmed.length > 0 ? trimmed : null
      tab.customTitle = next
      // Onglet prive (ephemere) ou pas encore persiste : le surnom reste en memoire et sera
      // ecrit a la prochaine persistance (persistTab transmet customTitle).
      if (tab.persisted && !tab.isPrivate) {
        await api()?.tabs.setTitle(tabId, next)
      }
    },

    setTabNavState(tabId: UUID, patch: Partial<BrowserTabView>): void {
      const tab = this.tabs.find((entry) => entry.id === tabId)
      if (!tab) {
        return
      }
      Object.assign(tab, patch)
    },

    async persistTab(tab: BrowserTabView): Promise<void> {
      const browser = api()
      // Un onglet prive n'est jamais ecrit en base (session ephemere).
      if (!browser || tab.isPrivate || tab.url.trim().length === 0) {
        return
      }
      try {
        await browser.tabs.upsert({
          id: tab.id,
          spaceId: tab.spaceId,
          url: tab.url,
          title: tab.title || undefined,
          customTitle: tab.customTitle ?? undefined,
          faviconUrl: tab.faviconUrl,
          isPinned: tab.isPinned,
          isActive: this.activeTabId === tab.id,
        })
        tab.persisted = true
      } catch {
        // La persistance de l'onglet est best-effort (restauration de session).
      }
    },

    recordHistoryForTab(tabId: UUID): void {
      const existing = historyTimers.get(tabId)
      if (existing) {
        clearTimeout(existing)
      }
      const timer = setTimeout(() => {
        historyTimers.delete(tabId)
        const tab = this.tabs.find((entry) => entry.id === tabId)
        const spaceId = this.activeSpaceId
        // Pas d'enregistrement d'historique en navigation privee.
        if (!tab || tab.isPrivate || !spaceId || !/^https?:\/\//i.test(tab.url)) {
          return
        }
        if (lastRecordedUrl.get(tabId) === tab.url) {
          return
        }
        lastRecordedUrl.set(tabId, tab.url)
        void api()?.history.record({
          spaceId,
          url: tab.url,
          title: tab.title || undefined,
          faviconUrl: tab.faviconUrl,
        })
      }, 500)
      historyTimers.set(tabId, timer)
    },

    async handleOpenTab(event: OmniBrowserOpenTabEvent): Promise<void> {
      const tabId = browserTabController.tabIdForWebContents(event.sourceWebContentsId)
      if (tabId) {
        await this.openTab(event.url, { activate: true })
        return
      }
      // Page web epinglee (hors OmniBrowser) : on garde le comportement historique (en place).
      if (webpageController.loadUrlForWebContents(event.sourceWebContentsId, event.url)) {
        return
      }
      // Source inconnue (course au montage) : filet anti-perte.
      await window.omnidesk?.shell.openExternal(event.url)
    },

    // --- Omnibox -----------------------------------------------------------

    async fetchSuggestions(query: string): Promise<void> {
      const browser = api()
      const spaceId = this.activeSpaceId
      this.omniboxQuery = query
      if (!browser || !spaceId) {
        return
      }
      const seq = ++suggestSeq
      const suggestions = await browser.omnibox.suggest(spaceId, query)
      if (seq === suggestSeq) {
        this.omniboxSuggestions = suggestions
      }
    },

    // --- Favoris -----------------------------------------------------------

    async addBookmark(input: {
      url: string
      title: string
      faviconUrl?: string
      categoryId?: UUID | null
    }): Promise<void> {
      const browser = api()
      const spaceId = this.activeSpaceId
      if (!browser || !spaceId) {
        return
      }
      const bookmark = await browser.bookmarks.create({
        spaceId,
        categoryId: input.categoryId ?? null,
        title: input.title || input.url,
        url: input.url,
        faviconUrl: input.faviconUrl,
      })
      this.bookmarks.push(bookmark)
    },

    async addBookmarkFromActiveTab(categoryId?: UUID | null): Promise<void> {
      const tab = this.activeTab
      if (!tab || !/^https?:\/\//i.test(tab.url)) {
        return
      }
      await this.addBookmark({
        url: tab.url,
        title: tab.title || tab.url,
        faviconUrl: tab.faviconUrl,
        categoryId: categoryId ?? null,
      })
    },

    async removeBookmark(id: UUID): Promise<void> {
      await api()?.bookmarks.delete(id)
      this.bookmarks = this.bookmarks.filter((bookmark) => bookmark.id !== id)
    },

    async moveBookmark(id: UUID, categoryId: UUID | null): Promise<void> {
      const browser = api()
      if (!browser) {
        return
      }
      const updated = await browser.bookmarks.update({ id, categoryId })
      this.bookmarks = this.bookmarks.map((bookmark) => (bookmark.id === id ? updated : bookmark))
    },

    async createCategory(name: string): Promise<void> {
      const browser = api()
      const spaceId = this.activeSpaceId
      if (!browser || !spaceId) {
        return
      }
      const category = await browser.categories.create(spaceId, name)
      this.categories.push(category)
    },

    async renameCategory(id: UUID, name: string): Promise<void> {
      const browser = api()
      if (!browser) {
        return
      }
      const updated = await browser.categories.update(id, name)
      this.categories = this.categories.map((category) => (category.id === id ? updated : category))
    },

    async deleteCategory(id: UUID): Promise<void> {
      await api()?.categories.delete(id)
      this.categories = this.categories.filter((category) => category.id !== id)
      this.bookmarks = this.bookmarks.map((bookmark) =>
        bookmark.categoryId === id ? { ...bookmark, categoryId: null } : bookmark,
      )
    },

    // --- Historique --------------------------------------------------------

    async loadHistory(): Promise<void> {
      const browser = api()
      const spaceId = this.activeSpaceId
      if (!browser || !spaceId) {
        return
      }
      this.history = await browser.history.list(spaceId, { limit: 200 })
    },

    async searchHistory(query: string): Promise<void> {
      const browser = api()
      const spaceId = this.activeSpaceId
      if (!browser || !spaceId) {
        return
      }
      const trimmed = query.trim()
      this.history =
        trimmed.length === 0
          ? await browser.history.list(spaceId, { limit: 200 })
          : await browser.history.search(spaceId, trimmed, 100)
    },

    async deleteHistoryEntry(id: UUID): Promise<void> {
      await api()?.history.delete(id)
      this.history = this.history.filter((entry) => entry.id !== id)
    },

    async clearHistory(): Promise<void> {
      const browser = api()
      const spaceId = this.activeSpaceId
      if (!browser || !spaceId) {
        return
      }
      await browser.history.clear(spaceId)
      this.history = []
      lastRecordedUrl.clear()
    },

    // --- Reglages (moteur de recherche, sidebar) ---------------------------

    async setSearchEngine(id: string): Promise<void> {
      const browser = api()
      this.settings = { ...this.settings, searchEngineId: id }
      if (browser) {
        this.settings = await browser.settings.update({ searchEngineId: id })
      }
    },

    // Active et enregistre le moteur de recherche personnalise.
    async setCustomSearchEngine(input: { name: string; template: string }): Promise<void> {
      const browser = api()
      const patch = {
        searchEngineId: CUSTOM_SEARCH_ENGINE_ID,
        customSearchName: input.name,
        customSearchTemplate: input.template,
      }
      this.settings = { ...this.settings, ...patch }
      if (browser) {
        this.settings = await browser.settings.update(patch)
      }
    },

    // --- Raccourcis clavier ------------------------------------------------

    async persistShortcuts(
      shortcuts: Partial<Record<OmniBrowserShortcutAction, string>>,
    ): Promise<void> {
      const browser = api()
      this.settings = { ...this.settings, shortcuts }
      if (browser) {
        this.settings = await browser.settings.update({ shortcuts })
      }
    },

    async setShortcut(action: OmniBrowserShortcutAction, accelerator: string): Promise<void> {
      await this.persistShortcuts({ ...(this.settings.shortcuts ?? {}), [action]: accelerator })
    },

    // Retire l'override : l'action repasse sur son accelerateur par defaut.
    async resetShortcut(action: OmniBrowserShortcutAction): Promise<void> {
      const shortcuts = { ...(this.settings.shortcuts ?? {}) }
      delete shortcuts[action]
      await this.persistShortcuts(shortcuts)
    },

    async resetAllShortcuts(): Promise<void> {
      await this.persistShortcuts({})
    },

    async setSidebarCollapsed(collapsed: boolean): Promise<void> {
      const browser = api()
      this.settings = { ...this.settings, sidebarCollapsed: collapsed }
      if (browser) {
        this.settings = await browser.settings.update({ sidebarCollapsed: collapsed })
      }
    },

    toggleSidebar(): void {
      void this.setSidebarCollapsed(!this.settings.sidebarCollapsed)
    },

    requestOmniboxFocus(): void {
      this.omniboxFocusToken += 1
    },

    async newTabFromShortcut(): Promise<void> {
      await this.initBrowser()
      await this.openTab('')
      this.requestOmniboxFocus()
    },

    // --- Groupes d'onglets -------------------------------------------------

    async createTabGroup(name: string): Promise<void> {
      const browser = api()
      const spaceId = this.activeSpaceId
      if (!browser || !spaceId) {
        return
      }
      const group = await browser.tabGroups.create({ spaceId, name })
      this.tabGroups.push(group)
    },

    async renameTabGroup(id: UUID, name: string): Promise<void> {
      const browser = api()
      if (!browser) {
        return
      }
      const updated = await browser.tabGroups.update({ id, name })
      this.tabGroups = this.tabGroups.map((group) => (group.id === id ? updated : group))
    },

    async toggleTabGroupCollapsed(id: UUID): Promise<void> {
      const browser = api()
      const group = this.tabGroups.find((entry) => entry.id === id)
      if (!browser || !group) {
        return
      }
      const updated = await browser.tabGroups.update({ id, isCollapsed: !group.isCollapsed })
      this.tabGroups = this.tabGroups.map((entry) => (entry.id === id ? updated : entry))
    },

    async deleteTabGroup(id: UUID): Promise<void> {
      await api()?.tabGroups.delete(id)
      this.tabGroups = this.tabGroups.filter((group) => group.id !== id)
      this.tabs = this.tabs.map((tab) => (tab.groupId === id ? { ...tab, groupId: null } : tab))
    },

    async setTabGroup(tabId: UUID, groupId: UUID | null): Promise<void> {
      const tab = this.tabs.find((entry) => entry.id === tabId)
      // Les groupes ne concernent que les onglets normaux.
      if (!tab || tab.isPrivate) {
        return
      }
      tab.groupId = groupId
      if (tab.persisted) {
        await api()?.tabs.setGroup(tabId, groupId)
      }
    },

    // --- Extensions --------------------------------------------------------

    async loadExtensions(): Promise<void> {
      const browser = api()
      if (!browser) {
        return
      }
      this.extensions = await browser.extensions.list()
    },

    async addExtension(): Promise<void> {
      const browser = api()
      if (!browser) {
        return
      }
      try {
        const extension = await browser.extensions.add()
        if (extension) {
          this.extensions.push(extension)
        }
      } catch (error) {
        this.error = errorMessage(error, "Impossible de charger l'extension.")
      }
    },

    async toggleExtension(id: UUID, enabled: boolean): Promise<void> {
      const browser = api()
      if (!browser) {
        return
      }
      const updated = await browser.extensions.setEnabled(id, enabled)
      this.extensions = this.extensions.map((extension) =>
        extension.id === id ? updated : extension,
      )
    },

    async removeExtension(id: UUID): Promise<void> {
      await api()?.extensions.remove(id)
      this.extensions = this.extensions.filter((extension) => extension.id !== id)
    },

    // --- Identifiants (gestionnaire de mots de passe) ----------------------

    // Autofill au chargement : pre-remplit le formulaire avec le compte le plus recent du site.
    async autofillCredentials(tabId: UUID): Promise<void> {
      const tab = this.tabs.find((entry) => entry.id === tabId)
      if (!tab || tab.isPrivate) {
        return
      }
      const origin = credentialOrigin(tab.url)
      if (!origin) {
        return
      }
      // omniPass (s'il est deverrouille) est prioritaire ; sinon repli sur les identifiants du navigateur.
      const cred =
        (await window.omnidesk?.passvault?.findForOrigin(origin)) ??
        (await api()?.credentials.forOrigin(origin))
      if (!cred) {
        return
      }
      // Le formulaire peut etre rendu apres dom-ready (pages SPA, etape revelee en differe) :
      // on reessaie quelques secondes jusqu'a trouver le champ, sans ecraser une saisie en cours.
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const filled = await browserTabController.fillCredentials(tabId, cred.username, cred.password)
        if (filled) {
          lastFilledByTab.set(tabId, { username: cred.username, password: cred.password })
          return
        }
        // Onglet ferme ou parti sur une autre origine entre-temps : on n'insiste pas.
        const current = this.tabs.find((entry) => entry.id === tabId)
        if (!current || credentialOrigin(current.url) !== origin) {
          return
        }
        await delay(400)
      }
    },

    // Apres soumission : recupere l'identifiant saisi et propose l'enregistrement s'il est nouveau.
    async captureCredentials(tabId: UUID): Promise<void> {
      const tab = this.tabs.find((entry) => entry.id === tabId)
      if (!tab || tab.isPrivate) {
        return
      }
      const captured = await browserTabController.drainCapturedCredentials(tabId)
      const last = captured[captured.length - 1]
      if (!last || !last.password) {
        return
      }
      const origin = credentialOrigin(tab.url)
      if (!origin) {
        return
      }
      const filled = lastFilledByTab.get(tabId)
      // Deja connu (auto-rempli a l'identique) : inutile de reproposer.
      if (filled && filled.username === last.username && filled.password === last.password) {
        return
      }
      this.credentialPrompt = { tabId, origin, username: last.username, password: last.password }
    },

    async saveCredentialFromPrompt(): Promise<void> {
      const prompt = this.credentialPrompt
      if (!prompt) {
        return
      }
      this.credentialPrompt = undefined
      lastFilledByTab.set(prompt.tabId, { username: prompt.username, password: prompt.password })
      await api()?.credentials.save({
        origin: prompt.origin,
        username: prompt.username,
        password: prompt.password,
      })
    },

    dismissCredentialPrompt(): void {
      this.credentialPrompt = undefined
    },

    async loadCredentials(): Promise<void> {
      this.credentials = (await api()?.credentials.list()) ?? []
    },

    async deleteCredential(id: UUID): Promise<void> {
      await api()?.credentials.delete(id)
      this.credentials = this.credentials.filter((credential) => credential.id !== id)
    },
  },
})

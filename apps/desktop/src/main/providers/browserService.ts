import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { safeStorage, session } from 'electron'
import type { Database } from 'better-sqlite3'
import { AppError } from '@shared/errors'
import type {
  BrowserBookmark,
  BrowserBookmarkCategory,
  BrowserCredential,
  BrowserCredentialFill,
  BrowserExtension,
  BrowserHistoryEntry,
  BrowserSpace,
  BrowserTab,
  BrowserTabGroup,
  CreateBrowserSpaceInput,
  OmniboxSuggestion,
  OmniBrowserSettings,
  UpdateBrowserSpaceInput,
  UUID,
} from '@shared/models'
import { buildSearchUrl, DEFAULT_SEARCH_ENGINE } from '@shared/searchEngines'
import { resolveShortcuts, type OmniBrowserShortcutAction } from '@shared/shortcuts'
import { AppSettingsRepository } from '@main/database/repositories/appSettingsRepository'
import { BrowserBookmarkCategoryRepository } from '@main/database/repositories/browserBookmarkCategoryRepository'
import { BrowserBookmarkRepository } from '@main/database/repositories/browserBookmarkRepository'
import { BrowserHistoryRepository } from '@main/database/repositories/browserHistoryRepository'
import { BrowserSpaceRepository } from '@main/database/repositories/browserSpaceRepository'
import { BrowserCredentialRepository } from '@main/database/repositories/browserCredentialRepository'
import { BrowserTabGroupRepository } from '@main/database/repositories/browserTabGroupRepository'
import { BrowserTabRepository } from '@main/database/repositories/browserTabRepository'
import { logger } from '@main/logger'
import { ExtensionService } from './extensionService'
import { webpageFilterService } from './webpageFilterService'

const SETTINGS_KEY = 'omnibrowser.settings'
const DEFAULT_SETTINGS: OmniBrowserSettings = {
  searchEngineId: DEFAULT_SEARCH_ENGINE.id,
  sidebarCollapsed: false,
}

const spacePartition = (spaceId: UUID): string => `persist:omnibrowser-${spaceId}`

// Heuristique "ceci ressemble-t-il a une URL ?" pour l'omnibox : un schema http(s)
// explicite, ou un host.tld[/...] sans espace. Sinon on traite comme une recherche.
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

const toNavigableUrl = (value: string): string => {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  return `https://${trimmed}`
}

export class BrowserService {
  private readonly spaces: BrowserSpaceRepository
  private readonly categories: BrowserBookmarkCategoryRepository
  private readonly bookmarks: BrowserBookmarkRepository
  private readonly history: BrowserHistoryRepository
  private readonly tabs: BrowserTabRepository
  private readonly tabGroups: BrowserTabGroupRepository
  private readonly credentials: BrowserCredentialRepository
  private readonly settingsStore: AppSettingsRepository
  private readonly extensions: ExtensionService

  constructor(db: Database) {
    this.spaces = new BrowserSpaceRepository(db)
    this.categories = new BrowserBookmarkCategoryRepository(db)
    this.bookmarks = new BrowserBookmarkRepository(db)
    this.history = new BrowserHistoryRepository(db)
    this.tabs = new BrowserTabRepository(db)
    this.tabGroups = new BrowserTabGroupRepository(db)
    this.credentials = new BrowserCredentialRepository(db)
    this.settingsStore = new AppSettingsRepository(db)
    this.extensions = new ExtensionService(db, () =>
      this.spaces.list().map((space) => space.partitionKey),
    )
    this.hydrateFilters()
    void this.extensions.loadAll()
  }

  private hydrateFilters(): void {
    for (const space of this.spaces.list()) {
      webpageFilterService.setFlags(space.partitionKey, {
        adBlock: space.adBlock,
      })
    }
  }

  private requireSpace(spaceId: UUID): BrowserSpace {
    const space = this.spaces.get(spaceId)
    if (!space) {
      throw new AppError('DATABASE_ERROR', 'Cet espace est introuvable.')
    }
    return space
  }

  // --- Espaces -------------------------------------------------------------

  listSpaces(): BrowserSpace[] {
    const spaces = this.spaces.list()
    if (spaces.length > 0) {
      return spaces
    }
    const created = this.createSpace({ name: 'Perso' })
    this.spaces.setActive(created.id)
    return this.spaces.list()
  }

  createSpace(input: CreateBrowserSpaceInput): BrowserSpace {
    const id = randomUUID()
    const space = this.spaces.create({
      id,
      name: input.name,
      icon: input.icon,
      color: input.color,
      partitionKey: spacePartition(id),
    })
    webpageFilterService.setFlags(space.partitionKey, {
      adBlock: space.adBlock,
    })
    void this.extensions.loadEnabledIntoSession(space.partitionKey)
    return space
  }

  updateSpace(input: UpdateBrowserSpaceInput): BrowserSpace {
    this.requireSpace(input.id)
    return this.spaces.update(input)
  }

  reorderSpaces(ids: UUID[]): BrowserSpace[] {
    return this.spaces.reorder(ids)
  }

  setActiveSpace(id: UUID): void {
    this.requireSpace(id)
    this.spaces.setActive(id)
  }

  setSpaceAdBlock(spaceId: UUID, enabled: boolean): BrowserSpace {
    const space = this.requireSpace(spaceId)
    const updated = this.spaces.setFilterFlags(spaceId, { adBlock: enabled })
    webpageFilterService.setFlags(space.partitionKey, { adBlock: enabled })
    return updated
  }

  async deleteSpace(id: UUID): Promise<void> {
    const partitionKey = this.spaces.partitionKey(id)
    this.spaces.delete(id)
    if (partitionKey) {
      webpageFilterService.remove(partitionKey)
      try {
        await session.fromPartition(partitionKey).clearStorageData()
      } catch (error) {
        logger.warn?.('browserService: nettoyage partition impossible', { partitionKey, error })
      }
    }
  }

  // --- Categories ----------------------------------------------------------

  listCategories(spaceId: UUID): BrowserBookmarkCategory[] {
    return this.categories.listForSpace(spaceId)
  }

  createCategory(spaceId: UUID, name: string): BrowserBookmarkCategory {
    this.requireSpace(spaceId)
    return this.categories.create(spaceId, name)
  }

  updateCategory(id: UUID, name: string): BrowserBookmarkCategory {
    return this.categories.update(id, name)
  }

  reorderCategories(spaceId: UUID, ids: UUID[]): BrowserBookmarkCategory[] {
    return this.categories.reorder(spaceId, ids)
  }

  deleteCategory(id: UUID): void {
    this.categories.delete(id)
  }

  // --- Favoris -------------------------------------------------------------

  listBookmarks(spaceId: UUID): BrowserBookmark[] {
    return this.bookmarks.listForSpace(spaceId)
  }

  createBookmark(input: {
    spaceId: UUID
    categoryId?: UUID | null
    title: string
    url: string
    faviconUrl?: string
  }): BrowserBookmark {
    this.requireSpace(input.spaceId)
    return this.bookmarks.create(input)
  }

  updateBookmark(input: {
    id: UUID
    title?: string
    url?: string
    faviconUrl?: string
    categoryId?: UUID | null
  }): BrowserBookmark {
    return this.bookmarks.update(input)
  }

  reorderBookmarks(spaceId: UUID, ids: UUID[]): BrowserBookmark[] {
    return this.bookmarks.reorder(spaceId, ids)
  }

  deleteBookmark(id: UUID): void {
    this.bookmarks.delete(id)
  }

  // --- Historique ----------------------------------------------------------

  recordHistory(input: {
    spaceId: UUID
    url: string
    title?: string
    faviconUrl?: string
  }): BrowserHistoryEntry {
    return this.history.record(input)
  }

  listHistory(spaceId: UUID, options?: { limit?: number; before?: string }): BrowserHistoryEntry[] {
    return this.history.listForSpace(spaceId, options)
  }

  searchHistory(spaceId: UUID, query: string, limit?: number): BrowserHistoryEntry[] {
    return this.history.search(spaceId, query, limit)
  }

  deleteHistory(id: UUID): void {
    this.history.delete(id)
  }

  clearHistory(spaceId: UUID): void {
    this.history.clearForSpace(spaceId)
  }

  // --- Onglets -------------------------------------------------------------

  listTabs(spaceId: UUID): BrowserTab[] {
    return this.tabs.listForSpace(spaceId)
  }

  upsertTab(input: {
    id?: UUID
    spaceId: UUID
    url: string
    title?: string
    customTitle?: string | null
    faviconUrl?: string
    isPinned?: boolean
    isActive?: boolean
  }): BrowserTab {
    return this.tabs.upsert(input)
  }

  setActiveTab(spaceId: UUID, tabId: UUID): void {
    this.tabs.setActive(spaceId, tabId)
  }

  reorderTabs(spaceId: UUID, ids: UUID[]): BrowserTab[] {
    return this.tabs.reorder(spaceId, ids)
  }

  closeTab(id: UUID): void {
    this.tabs.close(id)
  }

  // --- Omnibox -------------------------------------------------------------

  suggest(spaceId: UUID, query: string, limit = 8): OmniboxSuggestion[] {
    const trimmed = query.trim()

    if (trimmed.length === 0) {
      return this.history.topSites(spaceId, limit).map((entry) => ({
        kind: 'top-site' as const,
        title: entry.title ?? entry.url,
        url: entry.url,
        faviconUrl: entry.faviconUrl,
      }))
    }

    const suggestions: OmniboxSuggestion[] = []
    const seen = new Set<string>()
    const push = (suggestion: OmniboxSuggestion): void => {
      if (seen.has(suggestion.url) || suggestions.length >= limit) {
        return
      }
      seen.add(suggestion.url)
      suggestions.push(suggestion)
    }

    if (looksLikeUrl(trimmed)) {
      push({ kind: 'url', title: trimmed, url: toNavigableUrl(trimmed) })
    }

    const lowered = trimmed.toLowerCase()
    for (const bookmark of this.bookmarks.listForSpace(spaceId)) {
      if (
        bookmark.title.toLowerCase().includes(lowered)
        || bookmark.url.toLowerCase().includes(lowered)
      ) {
        push({
          kind: 'bookmark',
          title: bookmark.title,
          url: bookmark.url,
          faviconUrl: bookmark.faviconUrl,
        })
      }
    }

    for (const entry of this.history.search(spaceId, trimmed, limit)) {
      push({
        kind: 'history',
        title: entry.title ?? entry.url,
        url: entry.url,
        faviconUrl: entry.faviconUrl,
      })
    }

    // Toujours proposer une recherche web en dernier recours, avec le moteur choisi.
    suggestions.push({
      kind: 'search',
      title: `Rechercher « ${trimmed} »`,
      url: buildSearchUrl(this.getSettings(), trimmed),
    })

    return suggestions.slice(0, limit + 1)
  }

  // --- Reglages ------------------------------------------------------------

  getSettings(): OmniBrowserSettings {
    const stored = this.settingsStore.get<Partial<OmniBrowserSettings>>(SETTINGS_KEY)
    return { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
  }

  updateSettings(patch: Partial<OmniBrowserSettings>): OmniBrowserSettings {
    const next = { ...this.getSettings(), ...patch }
    this.settingsStore.set(SETTINGS_KEY, next)
    return next
  }

  // Accelerateurs effectifs (defauts fusionnes avec les overrides utilisateur),
  // consommes par le menu applicatif.
  getResolvedShortcuts(): Record<OmniBrowserShortcutAction, string> {
    return resolveShortcuts(this.getSettings().shortcuts)
  }

  // --- Groupes d'onglets ---------------------------------------------------

  listTabGroups(spaceId: UUID): BrowserTabGroup[] {
    return this.tabGroups.listForSpace(spaceId)
  }

  createTabGroup(spaceId: UUID, name: string, color?: string): BrowserTabGroup {
    this.requireSpace(spaceId)
    return this.tabGroups.create(spaceId, name, color)
  }

  updateTabGroup(input: { id: UUID; name?: string; color?: string; isCollapsed?: boolean }): BrowserTabGroup {
    return this.tabGroups.update(input)
  }

  reorderTabGroups(spaceId: UUID, ids: UUID[]): BrowserTabGroup[] {
    return this.tabGroups.reorder(spaceId, ids)
  }

  deleteTabGroup(id: UUID): void {
    // Detache les onglets du groupe avant suppression (robuste meme sans FK ON DELETE SET NULL).
    this.tabs.clearGroup(id)
    this.tabGroups.delete(id)
  }

  setTabGroup(tabId: UUID, groupId: UUID | null): BrowserTab | undefined {
    return this.tabs.setGroup(tabId, groupId)
  }

  setTabTitle(tabId: UUID, customTitle: string | null): BrowserTab | undefined {
    return this.tabs.setCustomTitle(tabId, customTitle)
  }

  // --- Extensions ----------------------------------------------------------

  listExtensions(): BrowserExtension[] {
    return this.extensions.list()
  }

  addExtension(path: string): Promise<BrowserExtension> {
    return this.extensions.add(path)
  }

  setExtensionEnabled(id: UUID, enabled: boolean): Promise<BrowserExtension> {
    return this.extensions.setEnabled(id, enabled)
  }

  removeExtension(id: UUID): Promise<void> {
    return this.extensions.remove(id)
  }

  // --- Identifiants (gestionnaire de mots de passe) ------------------------

  private ensureEncryption(): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new AppError(
        'TOKEN_STORAGE_FAILED',
        "Le chiffrement securise du systeme n'est pas disponible.",
      )
    }
  }

  // Chiffre le mot de passe via safeStorage (Keychain) avant stockage (base deja chiffree au repos).
  saveCredential(input: { origin: string; username: string; password: string }): BrowserCredential {
    this.ensureEncryption()
    const passwordB64 = safeStorage.encryptString(input.password).toString('base64')
    return this.credentials.upsert({
      origin: input.origin,
      username: input.username,
      passwordB64,
    })
  }

  // Autofill : renvoie le compte le plus recent pour cette origine, mot de passe dechiffre.
  getCredentialForOrigin(origin: string): BrowserCredentialFill | null {
    const latest = this.credentials.getForOrigin(origin)[0]
    if (!latest) {
      return null
    }
    try {
      this.ensureEncryption()
      const password = safeStorage.decryptString(Buffer.from(latest.passwordB64, 'base64'))
      return { username: latest.username, password }
    } catch (error) {
      logger.warn?.('browserService: dechiffrement identifiant impossible', { origin, error })
      return null
    }
  }

  listCredentials(): BrowserCredential[] {
    return this.credentials.list()
  }

  deleteCredential(id: UUID): void {
    this.credentials.delete(id)
  }
}

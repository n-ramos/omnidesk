import { defineStore } from 'pinia'
import type {
  CreatePassEntryInput,
  CreatePassFolderInput,
  PassEntrySecret,
  PassEntrySummary,
  PassFolderSummary,
  PassPassphraseGenOptions,
  PassPasswordGenOptions,
  PassVaultState,
  PassVaultStatus,
  UpdatePassEntryInput,
  UUID,
} from '@shared/models'

const api = (): typeof window.omnidesk => window.omnidesk

// Desabonnement de l'evenement de verrouillage (auto-lock cote main), conserve hors du state.
let stopLocked: (() => void) | undefined

// Noeud d'arbre derive de la liste plate des dossiers (construit cote renderer).
export interface PassFolderNode extends PassFolderSummary {
  children: PassFolderNode[]
}

// Liste plate -> arbre. Garde defensive (seen) contre un eventuel cycle de donnees : le service
// l'empeche deja, mais on evite tout risque de recursion infinie au rendu.
const buildFolderTree = (folders: PassFolderSummary[]): PassFolderNode[] => {
  const nodes: PassFolderNode[] = folders
    .map((folder) => ({ ...folder, children: [] as PassFolderNode[] }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
  const byParent = new Map<string | null, PassFolderNode[]>()
  for (const node of nodes) {
    const siblings = byParent.get(node.parentId) ?? []
    siblings.push(node)
    byParent.set(node.parentId, siblings)
  }
  const attach = (parentId: string | null, seen: Set<string>): PassFolderNode[] => {
    const list = (byParent.get(parentId) ?? []).filter((node) => !seen.has(node.id))
    for (const node of list) {
      seen.add(node.id)
      node.children = attach(node.id, seen)
    }
    return list
  }
  return attach(null, new Set())
}

interface OmnipassStoreState {
  status: PassVaultStatus
  autoLockMs: number
  biometricAvailable: boolean
  biometricEnabled: boolean
  recoveryEnabled: boolean
  entries: PassEntrySummary[]
  folders: PassFolderSummary[]
  selectedFolderId: UUID | null
  view: 'all' | 'favorites'
  query: string
  initialized: boolean
  working: boolean
  error?: string
}

// Etat du coffre omniPass cote renderer. La cle et les secrets ne vivent JAMAIS ici : seules les
// metadonnees dechiffrees (titre/identifiant/url, nom de dossier) transitent ; mot de passe et
// note sont obtenus ponctuellement via reveal/copy.
export const useOmnipassStore = defineStore('omnipass', {
  state: (): OmnipassStoreState => ({
    status: 'uninitialized',
    autoLockMs: 0,
    biometricAvailable: false,
    biometricEnabled: false,
    recoveryEnabled: false,
    entries: [],
    folders: [],
    selectedFolderId: null,
    view: 'all',
    query: '',
    initialized: false,
    working: false,
  }),

  getters: {
    isUnlocked: (state): boolean => state.status === 'unlocked',
    folderTree: (state): PassFolderNode[] => buildFolderTree(state.folders),
    selectedFolder: (state): PassFolderSummary | null =>
      state.selectedFolderId === null
        ? null
        : (state.folders.find((folder) => folder.id === state.selectedFolderId) ?? null),
    // Entrees affichees : recherche -> globale ; sinon celles du dossier selectionne ("Tout" = racine null = tout).
    // Entrees affichees selon la vue/le dossier + recherche. Dans un dossier precis (hors recherche
    // et hors favoris), on CONSERVE l'ordre de `entries` (deja trie par position cote repo) pour
    // permettre le reordonnancement manuel ; sinon tri alphabetique.
    visibleEntries: (state): PassEntrySummary[] => {
      const needle = state.query.trim().toLowerCase()
      if (needle.length > 0) {
        return state.entries
          .filter((entry) =>
            [entry.title, entry.username ?? '', entry.url ?? ''].some((field) =>
              field.toLowerCase().includes(needle),
            ),
          )
          .sort((a, b) => a.title.localeCompare(b.title))
      }
      if (state.view === 'favorites') {
        return state.entries.filter((entry) => entry.favorite).sort((a, b) => a.title.localeCompare(b.title))
      }
      if (state.selectedFolderId === null) {
        return [...state.entries].sort((a, b) => a.title.localeCompare(b.title))
      }
      return state.entries.filter((entry) => entry.folderId === state.selectedFolderId)
    },
    // Vrai uniquement quand le reordonnancement manuel des entrees a du sens (un dossier precis).
    entriesReorderable: (state): boolean =>
      state.query.trim().length === 0 && state.view === 'all' && state.selectedFolderId !== null,
  },

  actions: {
    async init(): Promise<void> {
      if (this.initialized) {
        return
      }
      const a = api()
      if (!a?.passvault?.getStatus) {
        return
      }
      this.initialized = true
      try {
        const state = await a.passvault.getStatus()
        this.applyState(state)
      } catch {
        // Non critique : on garde l'etat par defaut (uninitialized).
      }
      this.subscribe()
      if (this.status === 'unlocked') {
        await this.refreshAll()
      }
    },

    subscribe(): void {
      const a = api()
      if (!a?.events?.onPassvaultLocked) {
        return
      }
      stopLocked?.()
      stopLocked = a.events.onPassvaultLocked(() => {
        this.status = 'locked'
        this.entries = []
        this.folders = []
        this.selectedFolderId = null
        this.view = 'all'
      })
    },

    async refreshAll(): Promise<void> {
      await Promise.all([this.refreshFolders(), this.refreshEntries()])
    },

    async createVault(masterPassword: string): Promise<void> {
      const a = api()
      if (!a?.passvault?.createVault) {
        return
      }
      this.working = true
      this.error = undefined
      try {
        const state = await a.passvault.createVault(masterPassword)
        this.applyState(state)
        await this.refreshAll()
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Impossible de creer le coffre.'
      } finally {
        this.working = false
      }
    },

    async unlock(masterPassword: string): Promise<void> {
      const a = api()
      if (!a?.passvault?.unlock) {
        return
      }
      this.working = true
      this.error = undefined
      try {
        const state = await a.passvault.unlock(masterPassword)
        this.applyState(state)
        await this.refreshAll()
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Deverrouillage impossible.'
      } finally {
        this.working = false
      }
    },

    async lock(): Promise<void> {
      const a = api()
      if (!a?.passvault?.lock) {
        return
      }
      try {
        const state = await a.passvault.lock()
        this.applyState(state)
      } finally {
        this.entries = []
        this.folders = []
        this.selectedFolderId = null
      }
    },

    async refreshEntries(): Promise<void> {
      const a = api()
      if (!a?.passvault?.listEntries) {
        return
      }
      this.entries = await a.passvault.listEntries()
    },

    async refreshFolders(): Promise<void> {
      const a = api()
      if (!a?.passvault?.listFolders) {
        return
      }
      this.folders = await a.passvault.listFolders()
    },

    selectFolder(id: UUID | null): void {
      this.selectedFolderId = id
      this.view = 'all'
    },

    selectFavorites(): void {
      this.view = 'favorites'
    },

    async toggleFavorite(id: string, favorite: boolean): Promise<void> {
      const a = api()
      if (!a?.passvault?.updateEntry) {
        return
      }
      await a.passvault.updateEntry({ id, favorite })
      await this.refreshEntries()
    },

    async createEntry(input: CreatePassEntryInput): Promise<void> {
      const a = api()
      if (!a?.passvault?.createEntry) {
        return
      }
      this.working = true
      this.error = undefined
      try {
        await a.passvault.createEntry(input)
        await this.refreshEntries()
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Impossible d'enregistrer l'entree."
        throw error
      } finally {
        this.working = false
      }
    },

    async updateEntry(input: UpdatePassEntryInput): Promise<void> {
      const a = api()
      if (!a?.passvault?.updateEntry) {
        return
      }
      this.working = true
      this.error = undefined
      try {
        await a.passvault.updateEntry(input)
        await this.refreshEntries()
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Impossible de mettre a jour l'entree."
        throw error
      } finally {
        this.working = false
      }
    },

    async deleteEntry(id: string): Promise<void> {
      const a = api()
      if (!a?.passvault?.deleteEntry) {
        return
      }
      await a.passvault.deleteEntry(id)
      await this.refreshEntries()
    },

    // Deplace une entree dans un dossier (ou a la racine si null). Utilise par le glisser-deposer.
    async moveEntry(id: string, folderId: UUID | null): Promise<void> {
      const a = api()
      if (!a?.passvault?.updateEntry) {
        return
      }
      await a.passvault.updateEntry({ id, folderId })
      await this.refreshEntries()
    },

    async reorderEntries(folderId: UUID | null, ids: string[]): Promise<void> {
      const a = api()
      if (!a?.passvault?.reorderEntries) {
        return
      }
      await a.passvault.reorderEntries(folderId, ids)
      await this.refreshEntries()
    },

    async createFolder(input: CreatePassFolderInput): Promise<void> {
      const a = api()
      if (!a?.passvault?.createFolder) {
        return
      }
      this.working = true
      this.error = undefined
      try {
        await a.passvault.createFolder(input)
        await this.refreshFolders()
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Impossible de creer le dossier.'
        throw error
      } finally {
        this.working = false
      }
    },

    async renameFolder(id: string, name: string): Promise<void> {
      const a = api()
      if (!a?.passvault?.updateFolder) {
        return
      }
      try {
        await a.passvault.updateFolder({ id, name })
        await this.refreshFolders()
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Impossible de renommer le dossier.'
        throw error
      }
    },

    // Re-parente un dossier (glisser-deposer dans un autre dossier, ou a la racine si null).
    // L'anti-cycle est valide cote service : une erreur est exposee via store.error.
    async moveFolder(id: string, parentId: UUID | null): Promise<void> {
      const a = api()
      if (!a?.passvault?.updateFolder) {
        return
      }
      this.error = undefined
      try {
        await a.passvault.updateFolder({ id, parentId })
        await this.refreshFolders()
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Deplacement impossible.'
      }
    },

    async deleteFolder(id: string): Promise<void> {
      const a = api()
      if (!a?.passvault?.deleteFolder) {
        return
      }
      if (this.selectedFolderId === id) {
        this.selectedFolderId = null
      }
      await a.passvault.deleteFolder(id)
      // Le contenu a pu remonter au parent : on rafraichit dossiers ET entrees.
      await this.refreshAll()
    },

    async reorderFolders(parentId: UUID | null, ids: string[]): Promise<void> {
      const a = api()
      if (!a?.passvault?.reorderFolders) {
        return
      }
      await a.passvault.reorderFolders(parentId, ids)
      await this.refreshFolders()
    },

    // Revele un secret a la demande (affichage oeil / pre-remplissage du formulaire d'edition).
    async reveal(id: string): Promise<PassEntrySecret | null> {
      const a = api()
      if (!a?.passvault?.revealEntry) {
        return null
      }
      return a.passvault.revealEntry(id)
    },

    // Copie cote main (le secret ne transite pas par le renderer) ; effacement auto du presse-papier.
    async copy(id: string): Promise<void> {
      const a = api()
      if (!a?.passvault?.copyPassword) {
        return
      }
      await a.passvault.copyPassword(id)
    },

    async generate(options: PassPasswordGenOptions): Promise<string> {
      const a = api()
      if (!a?.passvault?.generatePassword) {
        return ''
      }
      const result = await a.passvault.generatePassword(options)
      return result.password
    },

    async generatePassphrase(options: PassPassphraseGenOptions): Promise<string> {
      const a = api()
      if (!a?.passvault?.generatePassphrase) {
        return ''
      }
      const result = await a.passvault.generatePassphrase(options)
      return result.password
    },

    async changeMasterPassword(oldPassword: string, newPassword: string): Promise<boolean> {
      const a = api()
      if (!a?.passvault?.changeMasterPassword) {
        return false
      }
      this.working = true
      this.error = undefined
      try {
        const state = await a.passvault.changeMasterPassword(oldPassword, newPassword)
        this.applyState(state)
        return true
      } catch (error) {
        this.error =
          error instanceof Error ? error.message : 'Changement du mot de passe impossible.'
        return false
      } finally {
        this.working = false
      }
    },

    applyState(state: PassVaultState): void {
      this.status = state.status
      this.autoLockMs = state.autoLockMs
      this.biometricAvailable = state.biometricAvailable
      this.biometricEnabled = state.biometricEnabled
      this.recoveryEnabled = state.recoveryEnabled
    },

    async enableBiometric(): Promise<void> {
      const a = api()
      if (!a?.passvault?.biometricEnable) {
        return
      }
      this.error = undefined
      try {
        this.applyState(await a.passvault.biometricEnable())
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Activation Touch ID impossible.'
      }
    },

    async disableBiometric(): Promise<void> {
      const a = api()
      if (!a?.passvault?.biometricDisable) {
        return
      }
      this.applyState(await a.passvault.biometricDisable())
    },

    async unlockWithBiometric(): Promise<void> {
      const a = api()
      if (!a?.passvault?.biometricUnlock) {
        return
      }
      this.working = true
      this.error = undefined
      try {
        this.applyState(await a.passvault.biometricUnlock())
        if (this.status === 'unlocked') {
          await this.refreshAll()
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Deverrouillage biometrique impossible.'
      } finally {
        this.working = false
      }
    },

    async generateRecovery(): Promise<string | null> {
      const a = api()
      if (!a?.passvault?.recoveryEnable) {
        return null
      }
      this.error = undefined
      try {
        const { code } = await a.passvault.recoveryEnable()
        this.recoveryEnabled = true
        return code
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Generation du code impossible.'
        return null
      }
    },

    async disableRecovery(): Promise<void> {
      const a = api()
      if (!a?.passvault?.recoveryDisable) {
        return
      }
      this.applyState(await a.passvault.recoveryDisable())
    },

    async unlockWithRecovery(code: string): Promise<void> {
      const a = api()
      if (!a?.passvault?.recoveryUnlock) {
        return
      }
      this.working = true
      this.error = undefined
      try {
        this.applyState(await a.passvault.recoveryUnlock(code))
        if (this.status === 'unlocked') {
          await this.refreshAll()
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Code de recuperation invalide.'
      } finally {
        this.working = false
      }
    },

    async exportBackup(password: string): Promise<boolean> {
      const a = api()
      if (!a?.passvault?.exportVault) {
        return false
      }
      this.error = undefined
      try {
        return (await a.passvault.exportVault(password)).saved
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Export impossible.'
        return false
      }
    },

    async importBackup(password: string): Promise<{ folders: number; entries: number } | null> {
      const a = api()
      if (!a?.passvault?.importVault) {
        return null
      }
      this.error = undefined
      try {
        const result = await a.passvault.importVault(password)
        if (result) {
          await this.refreshAll()
        }
        return result
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Import impossible.'
        return null
      }
    },

    async importFromBrowser(): Promise<number> {
      const a = api()
      if (!a?.passvault?.importBrowser) {
        return 0
      }
      this.error = undefined
      try {
        const { imported } = await a.passvault.importBrowser()
        await this.refreshAll()
        return imported
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Import depuis le navigateur impossible.'
        return 0
      }
    },
  },
})

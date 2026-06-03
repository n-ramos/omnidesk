import { randomUUID } from 'node:crypto'
import { clipboard, safeStorage, systemPreferences } from 'electron'
import type { Database } from 'better-sqlite3'
import { AppError, errorMessage } from '@shared/errors'
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
  UpdatePassFolderInput,
  UUID,
} from '@shared/models'
import { logger } from '@main/logger'
import { eventBus } from '@main/events/eventBus'
import {
  createVerifier,
  decryptField,
  deriveVaultKey,
  encryptField,
  exportVault,
  fieldAad,
  generatePassphrase,
  generatePassword,
  generateRecoveryCode,
  generateSalt,
  getDefaultKdfParams,
  importVault,
  normalizeRecoveryCode,
  unwrapVaultKey,
  verifyVerifier,
  wrapVaultKey,
  type KdfParams,
} from '@main/security/passVaultCrypto'
import {
  PassEntryRepository,
  type StoredPassEntry,
  type UpdatePassEntryRow,
} from '@main/database/repositories/passEntryRepository'
import {
  PassFolderRepository,
  type StoredPassFolder,
  type UpdatePassFolderRow,
} from '@main/database/repositories/passFolderRepository'
import {
  PassVaultRepository,
  type StoredVaultMeta,
} from '@main/database/repositories/passVaultRepository'

const DEFAULT_AUTO_LOCK_MS = 5 * 60 * 1000
const CLIPBOARD_CLEAR_MS = 20 * 1000
const MIN_MASTER_LENGTH = 8
const MAX_FAILED_BEFORE_LOCKOUT = 5
const LOCKOUT_STEP_MS = 2_000
const LOCKOUT_MAX_MS = 30_000

// Structures du fichier de sauvegarde (M3). Le clair n'existe que le temps de l'export/import.
interface ImportedFolder {
  id: string
  parentId: string | null
  name: string
  icon: string | null
}
interface ImportedEntry {
  folderId: string | null
  title: string
  username: string | null
  url: string | null
  password: string
  notes: string | null
  icon: string | null
}
interface ImportedVault {
  folders?: ImportedFolder[]
  entries?: ImportedEntry[]
}

// Extrait le hostname d'une url stockee, en tolerant l'absence de schema (ex. "github.com").
const hostOf = (raw: string): string | null => {
  try {
    return new URL(raw).hostname || null
  } catch {
    // pas une url absolue
  }
  try {
    return new URL(`https://${raw}`).hostname || null
  } catch {
    return null
  }
}

// Orchestre le coffre omniPass : derivation/verification du mot de passe maitre, cle DERIVEE
// gardee uniquement en memoire (jamais persistee ni transmise au renderer), auto-verrouillage,
// et chiffrement/dechiffrement des champs. Modele : ReminderScheduler (service a etat sur la db).
//
// INVARIANTS de securite : ni la cle ni le mot de passe maitre ne sont journalises ; les secrets
// ne quittent le main que sur demande explicite (revealEntrySecret) ; la copie passe par le
// presse-papier cote main (copyPasswordToClipboard) sans transiter par l'IPC.
export class PassVaultService {
  private readonly db: Database
  private readonly vaultRepo: PassVaultRepository
  private readonly entryRepo: PassEntryRepository
  private readonly folderRepo: PassFolderRepository

  private vaultKey: Buffer | null = null
  private status: PassVaultStatus
  private autoLockTimer?: ReturnType<typeof setTimeout>
  private autoLockMs = DEFAULT_AUTO_LOCK_MS

  private failedAttempts = 0
  private lockoutUntil = 0

  constructor(db: Database) {
    this.db = db
    this.vaultRepo = new PassVaultRepository(db)
    this.entryRepo = new PassEntryRepository(db)
    this.folderRepo = new PassFolderRepository(db)
    this.status = this.vaultRepo.exists() ? 'locked' : 'uninitialized'
  }

  getStatus(): PassVaultState {
    return {
      status: this.status,
      autoLockMs: this.autoLockMs,
      biometricAvailable: this.isBiometricAvailable(),
      biometricEnabled: this.vaultRepo.getBiometricWrapped() !== null,
      recoveryEnabled: this.vaultRepo.getRecovery() !== null,
    }
  }

  async createVault(masterPassword: string): Promise<PassVaultState> {
    if (this.status !== 'uninitialized') {
      throw new AppError('VAULT_ALREADY_INITIALIZED', 'Le coffre est deja initialise.')
    }
    if (masterPassword.length < MIN_MASTER_LENGTH) {
      throw new AppError(
        'VALIDATION_FAILED',
        `Le mot de passe maitre doit contenir au moins ${MIN_MASTER_LENGTH} caracteres.`,
      )
    }
    const salt = generateSalt()
    const params = getDefaultKdfParams()
    const key = await deriveVaultKey(masterPassword, salt, params)
    this.vaultRepo.initialize({
      saltB64: salt.toString('base64'),
      paramsJson: JSON.stringify(params),
      verifierB64: createVerifier(key),
    })
    this.adoptKey(key)
    logger.info('omnipass: vault created')
    return this.getStatus()
  }

  async unlock(masterPassword: string): Promise<PassVaultState> {
    if (this.status === 'uninitialized') {
      throw new AppError('VAULT_NOT_INITIALIZED', "Le coffre n'est pas encore cree.")
    }
    if (this.lockoutUntil > Date.now()) {
      throw new AppError(
        'INVALID_MASTER_PASSWORD',
        'Trop de tentatives. Patientez quelques secondes avant de reessayer.',
      )
    }

    const meta = this.vaultRepo.getMeta()
    if (!meta) {
      throw new AppError('VAULT_NOT_INITIALIZED', "Le coffre n'est pas encore cree.")
    }

    const params = JSON.parse(meta.paramsJson) as KdfParams
    const salt = Buffer.from(meta.saltB64, 'base64')
    const key = await deriveVaultKey(masterPassword, salt, params)

    if (!verifyVerifier(key, meta.verifierB64)) {
      key.fill(0)
      this.registerFailedAttempt()
      throw new AppError('INVALID_MASTER_PASSWORD', 'Mot de passe maitre incorrect.')
    }

    this.failedAttempts = 0
    this.lockoutUntil = 0
    this.adoptKey(key)
    eventBus.emit('passvault:unlocked', {})
    logger.info('omnipass: vault unlocked')
    return this.getStatus()
  }

  lock(): PassVaultState {
    const wasUnlocked = this.status === 'unlocked'
    this.purgeKey()
    this.status = this.vaultRepo.exists() ? 'locked' : 'uninitialized'
    // N'emet (et ne journalise) que sur une vraie transition depuis l'etat deverrouille : un
    // verrouillage redondant (ex. mise en veille coffre deja verrouille) ne doit pas notifier.
    if (wasUnlocked) {
      logger.info('omnipass: vault locked (manual)')
      eventBus.emit('passvault:locked', { reason: 'manual' })
    }
    return this.getStatus()
  }

  // Change le mot de passe maitre : re-derive une nouvelle cle (nouveau sel) et re-chiffre tout le
  // coffre en une transaction tout-ou-rien. La derivation scrypt (async) se fait HORS transaction.
  async changeMasterPassword(oldPassword: string, newPassword: string): Promise<PassVaultState> {
    this.requireUnlocked()
    if (this.lockoutUntil > Date.now()) {
      throw new AppError(
        'INVALID_MASTER_PASSWORD',
        'Trop de tentatives. Patientez quelques secondes avant de reessayer.',
      )
    }

    const meta = this.vaultRepo.getMeta()
    if (!meta) {
      throw new AppError('VAULT_NOT_INITIALIZED', "Le coffre n'est pas encore cree.")
    }

    // Re-verifie l'ancien mot de passe par RE-DERIVATION : la cle en memoire prouve "coffre
    // deverrouille", pas "l'utilisateur connait le mot de passe maintenant".
    const currentParams = JSON.parse(meta.paramsJson) as KdfParams
    const currentSalt = Buffer.from(meta.saltB64, 'base64')
    const oldKey = await deriveVaultKey(oldPassword, currentSalt, currentParams)
    try {
      if (!verifyVerifier(oldKey, meta.verifierB64)) {
        this.registerFailedAttempt()
        throw new AppError('INVALID_MASTER_PASSWORD', 'Mot de passe maitre incorrect.')
      }
      if (newPassword.length < MIN_MASTER_LENGTH) {
        throw new AppError(
          'VALIDATION_FAILED',
          `Le mot de passe maitre doit contenir au moins ${MIN_MASTER_LENGTH} caracteres.`,
        )
      }
      if (oldPassword.normalize('NFKC') === newPassword.normalize('NFKC')) {
        throw new AppError(
          'VALIDATION_FAILED',
          "Le nouveau mot de passe doit etre different de l'ancien.",
        )
      }

      // Nouveau sel + parametres (rotation), derives HORS de la transaction synchrone.
      const newSalt = generateSalt()
      const newParams = getDefaultKdfParams()
      const newKey = await deriveVaultKey(newPassword, newSalt, newParams)
      try {
        this.reencryptAll(oldKey, newKey, {
          saltB64: newSalt.toString('base64'),
          paramsJson: JSON.stringify(newParams),
          verifierB64: createVerifier(newKey),
        })
      } catch (error) {
        newKey.fill(0)
        if (error instanceof AppError) {
          throw error
        }
        throw new AppError(
          'DATABASE_ERROR',
          'Le changement de mot de passe a echoue. Le coffre est inchange.',
        )
      }
      this.failedAttempts = 0
      this.lockoutUntil = 0
      this.adoptKey(newKey)
      logger.info('omnipass: master password changed')
      return this.getStatus()
    } finally {
      oldKey.fill(0)
    }
  }

  listEntries(): PassEntrySummary[] {
    const key = this.requireUnlocked()
    const summaries = this.entryRepo.list().map((entry) => this.toSummary(key, entry))
    this.touch()
    return summaries
  }

  createEntry(input: CreatePassEntryInput): PassEntrySummary {
    const key = this.requireUnlocked()
    const id = randomUUID()
    const stored = this.entryRepo.create({
      id,
      folderId: input.folderId ?? null,
      titleEnc: encryptField(key, input.title, fieldAad(id, 'title')),
      usernameEnc: input.username ? encryptField(key, input.username, fieldAad(id, 'username')) : null,
      urlEnc: input.url ? encryptField(key, input.url, fieldAad(id, 'url')) : null,
      passwordEnc: encryptField(key, input.password, fieldAad(id, 'password')),
      notesEnc: input.notes ? encryptField(key, input.notes, fieldAad(id, 'notes')) : null,
      icon: input.icon ?? null,
      passwordUpdatedAt: new Date().toISOString(),
    })
    this.touch()
    return this.toSummary(key, stored)
  }

  updateEntry(input: UpdatePassEntryInput): PassEntrySummary {
    const key = this.requireUnlocked()
    const id = input.id
    const row: UpdatePassEntryRow = { id }

    if (input.title !== undefined) {
      row.titleEnc = encryptField(key, input.title, fieldAad(id, 'title'))
    }
    if (input.username !== undefined) {
      row.usernameEnc = input.username ? encryptField(key, input.username, fieldAad(id, 'username')) : null
    }
    if (input.url !== undefined) {
      row.urlEnc = input.url ? encryptField(key, input.url, fieldAad(id, 'url')) : null
    }
    if (input.password !== undefined) {
      row.passwordEnc = encryptField(key, input.password, fieldAad(id, 'password'))
      row.passwordUpdatedAt = new Date().toISOString()
    }
    if (input.notes !== undefined) {
      row.notesEnc = input.notes ? encryptField(key, input.notes, fieldAad(id, 'notes')) : null
    }
    if (input.icon !== undefined) row.icon = input.icon
    if (input.favorite !== undefined) row.favorite = input.favorite
    if (input.folderId !== undefined) row.folderId = input.folderId

    const stored = this.entryRepo.update(row)
    this.touch()
    return this.toSummary(key, stored)
  }

  deleteEntry(id: UUID): void {
    this.requireUnlocked()
    this.entryRepo.delete(id)
    this.touch()
  }

  // Seul point qui renvoie des secrets en clair au renderer (affichage explicite "oeil").
  revealEntrySecret(id: UUID): PassEntrySecret {
    const key = this.requireUnlocked()
    const stored = this.entryRepo.get(id)
    if (!stored) {
      throw new AppError('VALIDATION_FAILED', "Cette entree n'existe plus.")
    }
    this.touch()
    return {
      password: decryptField(key, stored.passwordEnc, fieldAad(id, 'password')),
      notes: stored.notesEnc ? decryptField(key, stored.notesEnc, fieldAad(id, 'notes')) : null,
    }
  }

  // Copie cote main : le mot de passe ne traverse jamais l'IPC. Efface le presse-papier apres un
  // delai, sans ecraser ce que l'utilisateur aurait copie entre-temps.
  copyPasswordToClipboard(id: UUID): void {
    const key = this.requireUnlocked()
    const stored = this.entryRepo.get(id)
    if (!stored) {
      throw new AppError('VALIDATION_FAILED', "Cette entree n'existe plus.")
    }
    const password = decryptField(key, stored.passwordEnc, fieldAad(id, 'password'))
    clipboard.writeText(password)
    this.touch()
    const timer = setTimeout(() => {
      if (clipboard.readText() === password) {
        clipboard.clear()
      }
    }, CLIPBOARD_CLEAR_MS)
    timer.unref()
  }

  // --- Dossiers ---
  listFolders(): PassFolderSummary[] {
    const key = this.requireUnlocked()
    const folders = this.folderRepo.list().map((folder) => this.toFolderSummary(key, folder))
    this.touch()
    return folders
  }

  createFolder(input: CreatePassFolderInput): PassFolderSummary {
    const key = this.requireUnlocked()
    const id = randomUUID()
    const stored = this.folderRepo.create({
      id,
      parentId: input.parentId ?? null,
      nameEnc: encryptField(key, input.name, fieldAad(id, 'name')),
      icon: input.icon ?? null,
    })
    this.touch()
    return this.toFolderSummary(key, stored)
  }

  updateFolder(input: UpdatePassFolderInput): PassFolderSummary {
    const key = this.requireUnlocked()
    const id = input.id
    if (input.parentId !== undefined && input.parentId !== null) {
      this.assertNoCycle(id, input.parentId)
    }
    const row: UpdatePassFolderRow = { id }
    if (input.name !== undefined) {
      row.nameEnc = encryptField(key, input.name, fieldAad(id, 'name'))
    }
    if (input.parentId !== undefined) row.parentId = input.parentId
    if (input.icon !== undefined) row.icon = input.icon
    const stored = this.folderRepo.update(row)
    this.touch()
    return this.toFolderSummary(key, stored)
  }

  // Suppression NON destructive : entrees et sous-dossiers directs remontent au parent du dossier
  // supprime (racine si dossier de premier niveau). Atomique (transaction).
  deleteFolder(id: UUID): void {
    this.requireUnlocked()
    const folder = this.folderRepo.get(id)
    if (!folder) {
      throw new AppError('VALIDATION_FAILED', "Ce dossier n'existe plus.")
    }
    const parentId = folder.parentId
    this.db.transaction(() => {
      this.entryRepo.reparentEntries(id, parentId)
      this.folderRepo.reparentChildren(id, parentId)
      this.folderRepo.delete(id)
    })()
    this.touch()
  }

  reorderFolders(ids: UUID[]): void {
    this.requireUnlocked()
    this.folderRepo.reorder(ids)
    this.touch()
  }

  reorderEntries(ids: UUID[]): void {
    this.requireUnlocked()
    this.entryRepo.reorder(ids)
    this.touch()
  }

  generate(options: PassPasswordGenOptions): string {
    return generatePassword(options)
  }

  generatePassphrase(options: PassPassphraseGenOptions): string {
    return generatePassphrase(options)
  }

  // --- Touch ID (M3, macOS) ---
  // Compromis assume : la cle est enveloppee par safeStorage (trousseau OS) ; promptTouchID est
  // une auth applicative, pas la Secure Enclave. Commodite, le mot de passe maitre reste le repli.
  async enableBiometric(): Promise<PassVaultState> {
    const key = this.requireUnlocked()
    if (!this.isBiometricAvailable()) {
      throw new AppError('VALIDATION_FAILED', "Le deverrouillage biometrique n'est pas disponible.")
    }
    this.vaultRepo.setBiometricWrapped(safeStorage.encryptString(key.toString('base64')).toString('base64'))
    this.touch()
    logger.info('omnipass: biometric unlock enabled')
    return this.getStatus()
  }

  disableBiometric(): PassVaultState {
    this.vaultRepo.setBiometricWrapped(null)
    if (this.status === 'unlocked') {
      this.touch()
    }
    return this.getStatus()
  }

  async unlockWithBiometric(): Promise<PassVaultState> {
    if (this.status === 'uninitialized') {
      throw new AppError('VAULT_NOT_INITIALIZED', "Le coffre n'est pas encore cree.")
    }
    const wrapped = this.vaultRepo.getBiometricWrapped()
    if (!wrapped) {
      throw new AppError('VALIDATION_FAILED', "Le deverrouillage biometrique n'est pas active.")
    }
    if (!this.isBiometricAvailable()) {
      throw new AppError('VALIDATION_FAILED', 'Touch ID indisponible.')
    }
    try {
      await systemPreferences.promptTouchID('deverrouiller omniPass')
    } catch {
      throw new AppError('INVALID_MASTER_PASSWORD', 'Authentification biometrique echouee.')
    }
    let keyB64: string
    try {
      keyB64 = safeStorage.decryptString(Buffer.from(wrapped, 'base64'))
    } catch (error) {
      // La cle enveloppee a ete scellee par une cle safeStorage que le trousseau de la session ne
      // possede plus (changement d'identite/signature de l'app, ou donnees venues d'une autre
      // machine). Le blob est definitivement illisible : on le purge pour que biometricEnabled
      // repasse a false (l'UI reproposera d'activer Touch ID). Le mot de passe maitre reste le repli.
      this.vaultRepo.setBiometricWrapped(null)
      logger.warn('omnipass: cle biometrique illisible, deverrouillage biometrique reinitialise', {
        error: errorMessage(error, 'safeStorage.decryptString a echoue'),
      })
      throw new AppError(
        'VALIDATION_FAILED',
        'Le deverrouillage biometrique a ete reinitialise. Deverrouillez avec le mot de passe maitre, puis reactivez Touch ID.',
      )
    }
    this.adoptKey(Buffer.from(keyB64, 'base64'))
    logger.info('omnipass: vault unlocked (biometric)')
    return this.getStatus()
  }

  // --- Code de recuperation (M3) : 2e cle. Le code est renvoye UNE fois (a conserver hors ligne). ---
  async enableRecovery(): Promise<string> {
    const key = this.requireUnlocked()
    const code = generateRecoveryCode()
    const salt = generateSalt()
    const params = getDefaultKdfParams()
    const recoveryKey = await deriveVaultKey(normalizeRecoveryCode(code), salt, params)
    try {
      this.vaultRepo.setRecovery({
        saltB64: salt.toString('base64'),
        paramsJson: JSON.stringify(params),
        wrappedB64: wrapVaultKey(recoveryKey, key),
      })
    } finally {
      recoveryKey.fill(0)
    }
    this.touch()
    logger.info('omnipass: recovery code generated')
    return code
  }

  disableRecovery(): PassVaultState {
    this.vaultRepo.setRecovery(null)
    if (this.status === 'unlocked') {
      this.touch()
    }
    return this.getStatus()
  }

  async unlockWithRecovery(code: string): Promise<PassVaultState> {
    if (this.status === 'uninitialized') {
      throw new AppError('VAULT_NOT_INITIALIZED', "Le coffre n'est pas encore cree.")
    }
    if (this.lockoutUntil > Date.now()) {
      throw new AppError('INVALID_MASTER_PASSWORD', 'Trop de tentatives. Patientez quelques secondes.')
    }
    const recovery = this.vaultRepo.getRecovery()
    if (!recovery) {
      throw new AppError('VALIDATION_FAILED', "Aucun code de recuperation n'est configure.")
    }
    const params = JSON.parse(recovery.paramsJson) as KdfParams
    const recoveryKey = await deriveVaultKey(
      normalizeRecoveryCode(code),
      Buffer.from(recovery.saltB64, 'base64'),
      params,
    )
    let key: Buffer
    try {
      key = unwrapVaultKey(recoveryKey, recovery.wrappedB64)
    } catch {
      this.registerFailedAttempt()
      throw new AppError('INVALID_MASTER_PASSWORD', 'Code de recuperation incorrect.')
    } finally {
      recoveryKey.fill(0)
    }
    this.failedAttempts = 0
    this.lockoutUntil = 0
    this.adoptKey(key)
    logger.info('omnipass: vault unlocked (recovery)')
    return this.getStatus()
  }

  // --- Sauvegarde chiffree (M3) ---
  async buildExport(exportPassword: string): Promise<string> {
    const key = this.requireUnlocked()
    const folders = this.folderRepo.list().map((folder) => ({
      id: folder.id,
      parentId: folder.parentId,
      name: decryptField(key, folder.nameEnc, fieldAad(folder.id, 'name')),
      icon: folder.icon,
    }))
    const entries = this.entryRepo.list().map((entry) => ({
      folderId: entry.folderId,
      title: decryptField(key, entry.titleEnc, fieldAad(entry.id, 'title')),
      username: entry.usernameEnc ? decryptField(key, entry.usernameEnc, fieldAad(entry.id, 'username')) : null,
      url: entry.urlEnc ? decryptField(key, entry.urlEnc, fieldAad(entry.id, 'url')) : null,
      password: decryptField(key, entry.passwordEnc, fieldAad(entry.id, 'password')),
      notes: entry.notesEnc ? decryptField(key, entry.notesEnc, fieldAad(entry.id, 'notes')) : null,
      icon: entry.icon,
    }))
    this.touch()
    return exportVault(JSON.stringify({ folders, entries }), exportPassword)
  }

  // Import = AJOUT (ids regeneres). Re-chiffre avec la cle courante, en une transaction.
  async applyImport(
    fileContent: string,
    exportPassword: string,
  ): Promise<{ folders: number; entries: number }> {
    const key = this.requireUnlocked()
    const json = await importVault(fileContent, exportPassword)
    let data: ImportedVault
    try {
      data = JSON.parse(json) as ImportedVault
    } catch {
      throw new AppError('VALIDATION_FAILED', 'Fichier de sauvegarde invalide.')
    }
    const folders = Array.isArray(data.folders) ? data.folders : []
    const entries = Array.isArray(data.entries) ? data.entries : []
    const idMap = new Map<string, string>()
    this.db.transaction(() => {
      for (const folder of folders) {
        const id = randomUUID()
        idMap.set(folder.id, id)
        this.folderRepo.create({
          id,
          parentId: null,
          nameEnc: encryptField(key, folder.name, fieldAad(id, 'name')),
          icon: folder.icon ?? null,
        })
      }
      for (const folder of folders) {
        const newId = folder.parentId ? idMap.get(folder.id) : undefined
        const newParent = folder.parentId ? idMap.get(folder.parentId) : undefined
        if (newId && newParent) {
          this.folderRepo.update({ id: newId, parentId: newParent })
        }
      }
      for (const entry of entries) {
        const id = randomUUID()
        const folderId = entry.folderId ? (idMap.get(entry.folderId) ?? null) : null
        this.entryRepo.create({
          id,
          folderId,
          titleEnc: encryptField(key, entry.title, fieldAad(id, 'title')),
          usernameEnc: entry.username ? encryptField(key, entry.username, fieldAad(id, 'username')) : null,
          urlEnc: entry.url ? encryptField(key, entry.url, fieldAad(id, 'url')) : null,
          passwordEnc: encryptField(key, entry.password, fieldAad(id, 'password')),
          notesEnc: entry.notes ? encryptField(key, entry.notes, fieldAad(id, 'notes')) : null,
          icon: entry.icon ?? null,
          passwordUpdatedAt: new Date().toISOString(),
        })
      }
    })()
    this.touch()
    return { folders: folders.length, entries: entries.length }
  }

  // --- Pont navigateur : autofill depuis le coffre (M3). Silencieux si verrouille. ---
  findForOrigin(origin: string): { username: string; password: string } | null {
    const key = this.vaultKey
    if (this.status !== 'unlocked' || !key) {
      return null
    }
    const targetHost = hostOf(origin)
    if (!targetHost) {
      return null
    }
    for (const entry of this.entryRepo.list()) {
      if (!entry.urlEnc) {
        continue
      }
      const entryHost = hostOf(decryptField(key, entry.urlEnc, fieldAad(entry.id, 'url')))
      if (entryHost === targetHost) {
        this.touch()
        return {
          username: entry.usernameEnc
            ? decryptField(key, entry.usernameEnc, fieldAad(entry.id, 'username'))
            : '',
          password: decryptField(key, entry.passwordEnc, fieldAad(entry.id, 'password')),
        }
      }
    }
    return null
  }

  // --- Etat interne ---
  private adoptKey(key: Buffer): void {
    this.purgeKey()
    this.vaultKey = key
    this.status = 'unlocked'
    this.touch()
  }

  private purgeKey(): void {
    if (this.vaultKey) {
      this.vaultKey.fill(0)
      this.vaultKey = null
    }
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer)
      this.autoLockTimer = undefined
    }
  }

  // Rearme l'auto-verrouillage. Appele par chaque operation reussie sur un coffre deverrouille.
  private touch(): void {
    if (this.status !== 'unlocked') {
      return
    }
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer)
    }
    this.autoLockTimer = setTimeout(() => this.autoLock(), this.autoLockMs)
    this.autoLockTimer.unref()
  }

  private autoLock(): void {
    this.purgeKey()
    this.status = this.vaultRepo.exists() ? 'locked' : 'uninitialized'
    eventBus.emit('passvault:locked', { reason: 'timeout' })
    logger.info('omnipass: vault auto-locked')
  }

  private requireUnlocked(): Buffer {
    const key = this.vaultKey
    if (this.status !== 'unlocked' || !key) {
      throw new AppError('VAULT_LOCKED', 'Le coffre est verrouille. Deverrouillez-le.')
    }
    return key
  }

  private isBiometricAvailable(): boolean {
    try {
      return process.platform === 'darwin' && systemPreferences.canPromptTouchID()
    } catch {
      return false
    }
  }

  private registerFailedAttempt(): void {
    this.failedAttempts += 1
    if (this.failedAttempts >= MAX_FAILED_BEFORE_LOCKOUT) {
      const backoff = Math.min(LOCKOUT_MAX_MS, (this.failedAttempts - MAX_FAILED_BEFORE_LOCKOUT + 1) * LOCKOUT_STEP_MS)
      this.lockoutUntil = Date.now() + backoff
    }
  }

  // Dechiffre les champs affichables (titre/identifiant/url) ; mot de passe et note restent
  // chiffres et ne sont revele que via revealEntrySecret.
  private toSummary(key: Buffer, entry: StoredPassEntry): PassEntrySummary {
    return {
      id: entry.id,
      folderId: entry.folderId,
      title: decryptField(key, entry.titleEnc, fieldAad(entry.id, 'title')),
      username: entry.usernameEnc ? decryptField(key, entry.usernameEnc, fieldAad(entry.id, 'username')) : null,
      url: entry.urlEnc ? decryptField(key, entry.urlEnc, fieldAad(entry.id, 'url')) : null,
      icon: entry.icon,
      favorite: entry.favorite,
      passwordUpdatedAt: entry.passwordUpdatedAt,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }
  }

  private toFolderSummary(key: Buffer, folder: StoredPassFolder): PassFolderSummary {
    return {
      id: folder.id,
      parentId: folder.parentId,
      name: decryptField(key, folder.nameEnc, fieldAad(folder.id, 'name')),
      icon: folder.icon,
      position: folder.position,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    }
  }

  // Refuse de rendre `candidateParent` le parent de `folderId` si cela creerait un cycle
  // (candidateParent est folderId lui-meme ou l'un de ses descendants).
  private assertNoCycle(folderId: UUID, candidateParent: UUID): void {
    if (candidateParent === folderId) {
      throw new AppError('VALIDATION_FAILED', 'Un dossier ne peut pas etre son propre parent.')
    }
    const byParent = new Map<string | null, StoredPassFolder[]>()
    for (const folder of this.folderRepo.list()) {
      const siblings = byParent.get(folder.parentId) ?? []
      siblings.push(folder)
      byParent.set(folder.parentId, siblings)
    }
    const stack: UUID[] = [folderId]
    while (stack.length > 0) {
      const current = stack.pop() as UUID
      for (const child of byParent.get(current) ?? []) {
        if (child.id === candidateParent) {
          throw new AppError(
            'VALIDATION_FAILED',
            "Impossible de deplacer un dossier dans l'un de ses sous-dossiers.",
          )
        }
        stack.push(child.id)
      }
    }
  }

  // Re-chiffre TOUTES les entrees et TOUS les dossiers avec newKey, puis met a jour la meta, en UNE
  // transaction synchrone. Si un dechiffrement echoue (entree corrompue) ou une ecriture rate, la
  // transaction better-sqlite3 rollback : aucune ligne modifiee, coffre intact sous l'ancien mdp.
  private reencryptAll(oldKey: Buffer, newKey: Buffer, newMeta: StoredVaultMeta): void {
    const run = this.db.transaction(() => {
      for (const entry of this.entryRepo.list()) {
        const row: UpdatePassEntryRow = { id: entry.id }
        row.titleEnc = this.rotateField(oldKey, newKey, entry.titleEnc, fieldAad(entry.id, 'title'))
        row.passwordEnc = this.rotateField(oldKey, newKey, entry.passwordEnc, fieldAad(entry.id, 'password'))
        if (entry.usernameEnc !== null) {
          row.usernameEnc = this.rotateField(oldKey, newKey, entry.usernameEnc, fieldAad(entry.id, 'username'))
        }
        if (entry.urlEnc !== null) {
          row.urlEnc = this.rotateField(oldKey, newKey, entry.urlEnc, fieldAad(entry.id, 'url'))
        }
        if (entry.notesEnc !== null) {
          row.notesEnc = this.rotateField(oldKey, newKey, entry.notesEnc, fieldAad(entry.id, 'notes'))
        }
        this.entryRepo.update(row)
      }
      for (const folder of this.folderRepo.list()) {
        this.folderRepo.update({
          id: folder.id,
          nameEnc: this.rotateField(oldKey, newKey, folder.nameEnc, fieldAad(folder.id, 'name')),
        })
      }
      // En dernier : sel/params/verifier basculent avec les blobs (coherence tout-ou-rien).
      this.vaultRepo.updateMeta(newMeta)
    })
    run()
  }

  // Dechiffre avec oldKey puis re-chiffre avec newKey sous la MEME AAD (l'id ne change pas).
  private rotateField(oldKey: Buffer, newKey: Buffer, blobB64: string, aad: Buffer): string {
    return encryptField(newKey, decryptField(oldKey, blobB64, aad), aad)
  }
}

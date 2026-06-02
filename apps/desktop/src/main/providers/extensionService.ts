import { session } from 'electron'
import type { Database } from 'better-sqlite3'
import { AppError } from '@shared/errors'
import type { BrowserExtension, UUID } from '@shared/models'
import { BrowserExtensionRepository } from '@main/database/repositories/browserExtensionRepository'
import { logger } from '@main/logger'

/**
 * Gere les extensions Chromium decompressees (unpacked). Electron ne donne pas acces
 * au Chrome Web Store ni a chrome://extensions : on charge un dossier d'extension via
 * session.loadExtension, dans la session de chaque espace OmniBrowser. Les extensions
 * doivent etre rechargees a chaque demarrage (Electron ne les persiste pas).
 */
export class ExtensionService {
  private readonly extensions: BrowserExtensionRepository
  private readonly electronIdByPath = new Map<string, string>()

  constructor(
    db: Database,
    private readonly getPartitions: () => string[],
  ) {
    this.extensions = new BrowserExtensionRepository(db)
  }

  list(): BrowserExtension[] {
    return this.extensions.list()
  }

  private async loadOne(partition: string, path: string): Promise<Electron.Extension | undefined> {
    try {
      const loaded = await session.fromPartition(partition).loadExtension(path, {
        allowFileAccess: true,
      })
      this.electronIdByPath.set(path, loaded.id)
      return loaded
    } catch (error) {
      logger.warn?.('extensionService: loadExtension a echoue', { partition, path, error })
      return undefined
    }
  }

  private unloadOne(partition: string, path: string): void {
    const electronId = this.electronIdByPath.get(path)
    if (!electronId) {
      return
    }
    try {
      session.fromPartition(partition).removeExtension(electronId)
    } catch (error) {
      logger.warn?.('extensionService: removeExtension a echoue', { partition, path, error })
    }
  }

  // Charge toutes les extensions activees dans une session (espace) donnee.
  async loadEnabledIntoSession(partition: string): Promise<void> {
    for (const extension of this.extensions.list()) {
      if (extension.isEnabled) {
        await this.loadOne(partition, extension.path)
      }
    }
  }

  // Au demarrage : charge les extensions activees dans toutes les sessions d'espaces.
  async loadAll(): Promise<void> {
    for (const partition of this.getPartitions()) {
      await this.loadEnabledIntoSession(partition)
    }
  }

  async add(path: string): Promise<BrowserExtension> {
    const partitions = this.getPartitions()
    const segments = path.split(/[\\/]/).filter(Boolean)
    let name = segments[segments.length - 1] ?? 'Extension'
    let version: string | undefined

    let loadedAtLeastOnce = false
    for (const partition of partitions) {
      const loaded = await this.loadOne(partition, path)
      if (loaded) {
        loadedAtLeastOnce = true
        name = loaded.name || name
        version = loaded.version
      }
    }

    if (!loadedAtLeastOnce && partitions.length > 0) {
      throw new AppError('PROVIDER_UNAVAILABLE', "Ce dossier n'est pas une extension Chromium valide.")
    }

    return this.extensions.create({ path, name, version })
  }

  async setEnabled(id: UUID, enabled: boolean): Promise<BrowserExtension> {
    const extension = this.extensions.get(id)
    if (!extension) {
      throw new AppError('DATABASE_ERROR', 'Extension introuvable.')
    }
    const updated = this.extensions.setEnabled(id, enabled)
    for (const partition of this.getPartitions()) {
      if (enabled) {
        await this.loadOne(partition, extension.path)
      } else {
        this.unloadOne(partition, extension.path)
      }
    }
    return updated
  }

  async remove(id: UUID): Promise<void> {
    const extension = this.extensions.get(id)
    if (!extension) {
      return
    }
    for (const partition of this.getPartitions()) {
      this.unloadOne(partition, extension.path)
    }
    this.extensions.delete(id)
  }
}

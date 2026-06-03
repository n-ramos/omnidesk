import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { logger } from '@main/logger'
import type { ChangelogEntry } from '@shared/ipc'
import { parseChangelog } from './changelogParser'

// CHANGELOG.md est empaquete a la racine de l'asar (cf. build.files) et lisible en dev
// depuis le dossier de l'app. On parse une fois puis on met en cache (immuable a froid).
let cache: ChangelogEntry[] | null = null

export const getChangelog = (): ChangelogEntry[] => {
  if (cache) {
    return cache
  }
  try {
    const markdown = readFileSync(join(app.getAppPath(), 'CHANGELOG.md'), 'utf8')
    cache = parseChangelog(markdown)
  } catch (error) {
    logger.warn('CHANGELOG.md introuvable ou illisible', error)
    cache = []
  }
  return cache
}

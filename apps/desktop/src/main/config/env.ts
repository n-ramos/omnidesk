import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

const parseDotenvLine = (line: string): { key: string; value: string } | undefined => {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) {
    return undefined
  }

  const equalsAt = trimmed.indexOf('=')
  if (equalsAt < 1) {
    return undefined
  }

  const key = trimmed.slice(0, equalsAt).trim()
  let value = trimmed.slice(equalsAt + 1).trim()

  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }

  return { key, value }
}

const loadEnvFromDisk = (): void => {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'apps/desktop/.env'),
    resolve(__dirname, '../../.env'),
    resolve(__dirname, '../../../.env'),
    resolve(__dirname, '../../../../apps/desktop/.env'),
  ]

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue
    }

    try {
      const content = readFileSync(candidate, 'utf8')
      for (const rawLine of content.split(/\r?\n/)) {
        const parsed = parseDotenvLine(rawLine)
        if (!parsed) {
          continue
        }

        if (process.env[parsed.key] === undefined || process.env[parsed.key] === '') {
          process.env[parsed.key] = parsed.value
        }
      }

      return
    } catch {
      continue
    }
  }
}

// Variables figees a la compilation par electron.vite.config.ts (define). Dans
// le DMG, aucun .env n'est embarque : ces valeurs en sont l'unique source. On
// n'y trouve QUE des donnees non sensibles (URL du proxy), jamais de cle/jeton.
// Le `typeof` evite un ReferenceError hors build Vite (ex. tests vitest).
declare const __OMNIDESK_BAKED_ENV__: Record<string, string> | undefined

const applyBakedEnv = (): void => {
  if (typeof __OMNIDESK_BAKED_ENV__ === 'undefined') {
    return
  }
  for (const [key, value] of Object.entries(__OMNIDESK_BAKED_ENV__)) {
    // Repli uniquement : un .env sur disque (dev) ou un process.env reel priment.
    if (value && (process.env[key] === undefined || process.env[key] === '')) {
      process.env[key] = value
    }
  }
}

loadEnvFromDisk()
applyBakedEnv()

const envSchema = z.object({
  OMNIDESK_APP_PROTOCOL: z.string().min(1).default('omnidesk'),
  OMNIDESK_LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'silly']).default('info'),
  // OmniProxy : backend qui mint les jetons LiveKit (omnichat). Optionnel :
  // sans lui, l'omnichat (appels audio/video) est desactive.
  OMNIDESK_PROXY_URL: z.string().url().optional(),
  OMNIDESK_PROXY_API_KEY: z.string().optional(),
  // Jeton d'identite omnichat (optionnel) : requis seulement si OmniProxy active
  // la signature (OMNICHAT_SIGNING_SECRET). Genere par `pnpm token <email>` cote
  // serveur. Lie cette installation a un email precis (anti-usurpation).
  OMNIDESK_OMNICHAT_TOKEN: z.string().optional(),
  OMNIDESK_SYNC_INTERVAL_IMAP_SECONDS: z.coerce.number().int().min(15).max(3600).default(60),
  OMNIDESK_TENOR_API_KEY: z.string().optional(),
  OMNIDESK_TENOR_CLIENT_KEY: z.string().default('omnidesk-desktop'),
})

export type AppConfig = z.infer<typeof envSchema>

export const appConfig: AppConfig = envSchema.parse(process.env)

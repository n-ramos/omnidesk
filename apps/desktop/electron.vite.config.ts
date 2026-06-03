import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

const r = (...paths: string[]): string => resolve(__dirname, ...paths)

// Lecture minimaliste d'un .env (meme format que src/main/config/env.ts) pour
// alimenter le "define" lors d'un build local (`pnpm dist`). En CI, les valeurs
// arrivent par process.env (secrets GitHub) et priment sur le fichier.
const readEnvFile = (path: string): Record<string, string> => {
  const out: Record<string, string> = {}
  if (!existsSync(path)) {
    return out
  }
  try {
    for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) {
        continue
      }
      const eq = line.indexOf('=')
      if (eq < 1) {
        continue
      }
      const key = line.slice(0, eq).trim()
      let value = line.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      out[key] = value
    }
  } catch {
    // .env illisible : on ignore, le build se fera sans valeur figee.
  }
  return out
}

// Variables figees dans le bundle "main" a la compilation. On n'embarque QUE des
// donnees NON sensibles (URL du proxy) : jamais de cle d'API ni de jeton, car le
// DMG est grand public et son asar est trivialement extractible. La cle/jeton
// restent lus au runtime depuis le .env en dev (choix "URL seule").
const dotenv = readEnvFile(r('.env'))
const bakedEnv: Record<string, string> = {}
const proxyUrl = process.env.OMNIDESK_PROXY_URL ?? dotenv.OMNIDESK_PROXY_URL
if (proxyUrl) {
  bakedEnv.OMNIDESK_PROXY_URL = proxyUrl
} else {
  console.warn(
    '[electron.vite] OMNIDESK_PROXY_URL absent : le build packagE n\'aura pas de proxy (omnichat/appels desactives).',
  )
}
const aliases = {
  main: [
    { find: '@main', replacement: r('src/main') },
    { find: '@shared', replacement: r('src/shared') },
  ],
  preload: [
    { find: '@preload', replacement: r('src/preload') },
    { find: '@shared', replacement: r('src/shared') },
  ],
  renderer: [
    { find: '@renderer', replacement: r('src/renderer') },
    { find: '@shared', replacement: r('src/shared') },
    { find: '@preload', replacement: r('src/preload') },
  ],
}

export default defineConfig({
  main: {
    resolve: {
      alias: aliases.main,
    },
    // Injecte les variables figees (cf. bakedEnv) sous forme de constante globale
    // remplacee a la compilation. Lue par src/main/config/env.ts en repli du .env.
    define: {
      __OMNIDESK_BAKED_ENV__: JSON.stringify(bakedEnv),
    },
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    resolve: {
      alias: aliases.preload,
    },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: r('src/renderer'),
    resolve: {
      alias: aliases.renderer,
    },
    plugins: [vue()],
  },
})

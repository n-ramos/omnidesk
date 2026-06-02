import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const r = (...paths: string[]): string => resolve(__dirname, ...paths)

// Tests unitaires Node (modules du process main : crypto du coffre omniPass, sauvegarde de
// l'app...). Les alias de chemin sont redeclares ici car Vitest ne lit pas
// electron.vite.config.ts ; les modules testes ne doivent toujours pas dependre des API Electron.
export default defineConfig({
  resolve: {
    alias: [
      { find: '@main', replacement: r('src/main') },
      { find: '@shared', replacement: r('src/shared') },
      { find: '@preload', replacement: r('src/preload') },
      { find: '@renderer', replacement: r('src/renderer') },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

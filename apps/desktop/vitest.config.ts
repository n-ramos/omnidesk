import { defineConfig } from 'vitest/config'

// Tests unitaires Node (modules purs du process main, ex. la crypto du coffre omniPass).
// Volontairement minimal : les modules testes n'utilisent aucun alias @ ni API Electron.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

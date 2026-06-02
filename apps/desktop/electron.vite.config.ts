import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

const r = (...paths: string[]): string => resolve(__dirname, ...paths)
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

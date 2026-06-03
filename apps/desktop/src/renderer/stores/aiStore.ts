import { defineStore } from 'pinia'
import type { AiConnectionTestResult, AiSettings, AiSettingsPatch } from '@shared/ai'
import { DEFAULT_AI_SETTINGS } from '@shared/ai'

interface AiState {
  settings: AiSettings
  hasToken: boolean
  loaded: boolean
}

export const useAiStore = defineStore('ai', {
  state: (): AiState => ({
    settings: { ...DEFAULT_AI_SETTINGS },
    hasToken: false,
    loaded: false,
  }),

  getters: {
    // L'assistant n'est utilisable que s'il est active ET qu'une cle est enregistree.
    configured: (state): boolean => state.settings.enabled && state.hasToken,
  },

  actions: {
    async load(): Promise<void> {
      const api = window.omnidesk
      if (!api?.ai) return
      const status = await api.ai.getSettings()
      this.settings = status.settings
      this.hasToken = status.hasToken
      this.loaded = true
    },

    async save(patch: AiSettingsPatch): Promise<void> {
      const api = window.omnidesk
      if (!api?.ai) return
      this.settings = await api.ai.setSettings(patch)
    },

    async setToken(token: string): Promise<void> {
      const api = window.omnidesk
      if (!api?.ai) return
      const result = await api.ai.setToken(token)
      this.hasToken = result.hasToken
    },

    async clearToken(): Promise<void> {
      const api = window.omnidesk
      if (!api?.ai) return
      const result = await api.ai.clearToken()
      this.hasToken = result.hasToken
    },

    async testConnection(): Promise<AiConnectionTestResult> {
      const api = window.omnidesk
      if (!api?.ai) {
        throw new Error("L'assistant n'est pas disponible.")
      }
      return api.ai.testConnection()
    },
  },
})

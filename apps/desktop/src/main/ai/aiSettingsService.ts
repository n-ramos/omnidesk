import type { AiSettings, AiSettingsPatch } from '@shared/ai'
import { DEFAULT_AI_SETTINGS } from '@shared/ai'
import { databaseClient } from '@main/database/client'
import { AppSettingsRepository } from '@main/database/repositories/appSettingsRepository'

// Reglages non sensibles de l'assistant, persistes en KV (table app_settings). Les defauts
// comblent toute cle manquante : un reglage ajoute plus tard reste retro-compatible.
const SETTINGS_KEY = 'ai.settings'

const repo = (): AppSettingsRepository => new AppSettingsRepository(databaseClient.open())

export const aiSettingsService = {
  get(): AiSettings {
    const stored = repo().get<Partial<AiSettings>>(SETTINGS_KEY)
    return { ...DEFAULT_AI_SETTINGS, ...(stored ?? {}) }
  },

  set(patch: AiSettingsPatch): AiSettings {
    const next: AiSettings = { ...this.get(), ...patch }
    repo().set<AiSettings>(SETTINGS_KEY, next)
    return next
  },
}

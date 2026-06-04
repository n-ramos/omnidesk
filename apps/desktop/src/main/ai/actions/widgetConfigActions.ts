import { z } from 'zod'
import type { AiToolDefinition } from '@shared/ai'
import { aiActionRegistry } from '../aiActionRegistry'
import { readConfig, requireWidget, setWidgetConfig, type WidgetActionDeps } from './homeContext'

const urlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => value.startsWith('http://') || value.startsWith('https://'), {
    message: "L'URL doit utiliser http ou https.",
  })

// weather.set_city : configure la ville du widget meteo de l'accueil.
const weatherSchema = z.object({ city: z.string().trim().min(1).max(120).describe('Ville a afficher.') })

const createWeatherSetCityAction = (deps: WidgetActionDeps): AiToolDefinition<z.infer<typeof weatherSchema>> => ({
  name: 'weather.set_city',
  description: "Definit la ville affichee par le widget meteo de l'accueil.",
  parameters: weatherSchema,
  mutating: true,
  category: 'system',
  preview: async (args) => ({
    title: 'Changer la ville meteo',
    summary: `Afficher la meteo de ${args.city}`,
    effect: 'Le widget meteo affichera cette ville.',
  }),
  execute: async (args) => {
    const instance = requireWidget(deps, 'weather')
    // On retire d'eventuelles coordonnees figees pour que le widget interroge la nouvelle ville.
    const config = { ...readConfig(instance) }
    delete config.latitude
    delete config.longitude
    config.city = args.city
    setWidgetConfig(deps, instance.id, config)
    return { ok: true, summary: `Widget meteo regle sur ${args.city}.` }
  },
})

// rss.set_feed : configure l'URL (et le titre) du widget RSS.
const rssSchema = z.object({
  url: urlSchema.describe('URL du flux RSS/Atom.'),
  label: z.string().trim().max(120).optional().describe('Titre personnalise du flux.'),
})

const createRssSetFeedAction = (deps: WidgetActionDeps): AiToolDefinition<z.infer<typeof rssSchema>> => ({
  name: 'rss.set_feed',
  description: "Definit le flux (URL + titre) du widget RSS de l'accueil.",
  parameters: rssSchema,
  mutating: true,
  category: 'system',
  preview: async (args) => ({
    title: 'Changer le flux RSS',
    summary: args.label ? `${args.label} (${args.url})` : args.url,
    effect: 'Le widget RSS affichera ce flux.',
  }),
  execute: async (args) => {
    const instance = requireWidget(deps, 'rss')
    const config: Record<string, unknown> = { ...readConfig(instance), url: args.url }
    if (args.label !== undefined) config.label = args.label
    setWidgetConfig(deps, instance.id, config)
    return { ok: true, summary: 'Flux RSS mis a jour.' }
  },
})

// countdown.set : configure la date cible (et le libelle) du widget compte a rebours.
const countdownSchema = z.object({
  targetDate: z.string().datetime().describe('Date/heure cible au format ISO 8601.'),
  label: z.string().trim().max(120).optional().describe('Libelle du compte a rebours.'),
})

const createCountdownSetAction = (deps: WidgetActionDeps): AiToolDefinition<z.infer<typeof countdownSchema>> => ({
  name: 'countdown.set',
  description: "Definit la date cible du widget compte a rebours de l'accueil.",
  parameters: countdownSchema,
  mutating: true,
  category: 'system',
  preview: async (args) => ({
    title: 'Regler le compte a rebours',
    summary: args.label ? `${args.label} : ${args.targetDate}` : args.targetDate,
    effect: 'Le widget comptera jusqu\'a cette date.',
  }),
  execute: async (args) => {
    const instance = requireWidget(deps, 'countdown')
    const config: Record<string, unknown> = { ...readConfig(instance), targetDate: args.targetDate }
    if (args.label !== undefined) config.label = args.label
    setWidgetConfig(deps, instance.id, config)
    return { ok: true, summary: 'Compte a rebours regle.' }
  },
})

// iframe.set_url : configure la page embarquee du widget iframe.
const iframeSchema = z.object({
  url: urlSchema.describe('URL de la page a embarquer.'),
  label: z.string().trim().max(120).optional().describe('Titre personnalise.'),
})

const createIframeSetUrlAction = (deps: WidgetActionDeps): AiToolDefinition<z.infer<typeof iframeSchema>> => ({
  name: 'iframe.set_url',
  description: "Definit la page web embarquee par le widget iframe de l'accueil.",
  parameters: iframeSchema,
  mutating: true,
  category: 'system',
  preview: async (args) => ({
    title: 'Changer la page embarquee',
    summary: args.label ? `${args.label} (${args.url})` : args.url,
    effect: 'Le widget iframe affichera cette page.',
  }),
  execute: async (args) => {
    const instance = requireWidget(deps, 'iframe')
    const config: Record<string, unknown> = { ...readConfig(instance), url: args.url }
    if (args.label !== undefined) config.label = args.label
    setWidgetConfig(deps, instance.id, config)
    return { ok: true, summary: 'Page embarquee mise a jour.' }
  },
})

// clock.toggle_seconds : affiche ou masque les secondes sur le widget horloge.
const clockSchema = z.object({ showSeconds: z.boolean().describe('true pour afficher les secondes.') })

const createClockToggleSecondsAction = (deps: WidgetActionDeps): AiToolDefinition<z.infer<typeof clockSchema>> => ({
  name: 'clock.toggle_seconds',
  description: "Affiche ou masque les secondes sur le widget horloge.",
  parameters: clockSchema,
  mutating: true,
  category: 'system',
  preview: async (args) => ({
    title: 'Widget horloge',
    summary: args.showSeconds ? 'Afficher les secondes' : 'Masquer les secondes',
    effect: "L'affichage de l'horloge sera ajuste.",
  }),
  execute: async (args) => {
    const instance = requireWidget(deps, 'clock')
    setWidgetConfig(deps, instance.id, { ...readConfig(instance), showSeconds: args.showSeconds })
    return { ok: true, summary: args.showSeconds ? 'Secondes affichees.' : 'Secondes masquees.' }
  },
})

export const registerWidgetConfigActions = (deps: WidgetActionDeps): void => {
  aiActionRegistry.register(createWeatherSetCityAction(deps))
  aiActionRegistry.register(createRssSetFeedAction(deps))
  aiActionRegistry.register(createCountdownSetAction(deps))
  aiActionRegistry.register(createIframeSetUrlAction(deps))
  aiActionRegistry.register(createClockToggleSecondsAction(deps))
}

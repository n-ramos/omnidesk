import { z } from 'zod'
import type { AiToolDefinition } from '@shared/ai'
import { aiActionRegistry } from '../aiActionRegistry'
import {
  addWidgetInstance,
  readConfig,
  removeWidgetInstance,
  setWidgetConfig,
  WIDGET_ID_VALUES,
  widgetLabel,
  type WidgetActionDeps,
} from './homeContext'

// home.list_widgets : lecture. L'IA s'en sert pour savoir quels widgets sont presents avant d'agir.
const createListWidgetsAction = (deps: WidgetActionDeps): AiToolDefinition<Record<string, never>> => ({
  name: 'home.list_widgets',
  description:
    "Liste les widgets presents sur l'accueil personnalise (avec leur identifiant d'instance et leur config). A appeler avant d'agir sur un widget pour verifier qu'il est bien present.",
  parameters: z.object({}),
  mutating: false,
  category: 'system',
  execute: async () => {
    const widgets = deps.homeLayout.list()
    return {
      ok: true,
      summary: widgets.length
        ? `${widgets.length} widget(s) sur l'accueil.`
        : "Aucun widget : l'accueil n'est pas personnalise.",
      data: {
        personalized: widgets.length > 0,
        widgets: widgets.map((w) => ({
          id: w.id,
          widgetId: w.widgetId,
          label: widgetLabel(w.widgetId),
          config: w.config ?? {},
        })),
      },
    }
  },
})

const addWidgetSchema = z.object({
  widgetId: z.enum(WIDGET_ID_VALUES).describe("Identifiant du widget a ajouter."),
})

const createAddWidgetAction = (deps: WidgetActionDeps): AiToolDefinition<z.infer<typeof addWidgetSchema>> => ({
  name: 'home.add_widget',
  description: "Ajoute un widget a l'accueil personnalise.",
  parameters: addWidgetSchema,
  mutating: true,
  category: 'system',
  preview: async (args) => ({
    title: 'Ajouter un widget',
    summary: `Ajouter "${widgetLabel(args.widgetId)}" a l'accueil`,
    effect: "Le widget sera ajoute en bas de votre accueil personnalise.",
  }),
  execute: async (args) => {
    addWidgetInstance(deps, args.widgetId)
    return { ok: true, summary: `Widget "${widgetLabel(args.widgetId)}" ajoute a l'accueil.` }
  },
})

const removeWidgetSchema = z.object({
  id: z.string().min(1).max(64).describe("Identifiant d'instance du widget (issu de home.list_widgets)."),
})

const createRemoveWidgetAction = (deps: WidgetActionDeps): AiToolDefinition<z.infer<typeof removeWidgetSchema>> => ({
  name: 'home.remove_widget',
  description: "Retire un widget de l'accueil personnalise.",
  parameters: removeWidgetSchema,
  mutating: true,
  category: 'system',
  preview: async (args) => {
    const instance = deps.homeLayout.list().find((w) => w.id === args.id)
    return {
      title: 'Retirer un widget',
      summary: instance ? `Retirer "${widgetLabel(instance.widgetId)}"` : 'Retirer un widget',
      effect: "Le widget sera retire de l'accueil.",
    }
  },
  execute: async (args) => {
    const removed = removeWidgetInstance(deps, args.id)
    return removed
      ? { ok: true, summary: 'Widget retire de l\'accueil.' }
      : { ok: false, summary: 'Widget introuvable sur l\'accueil.' }
  },
})

const configureWidgetSchema = z.object({
  id: z.string().min(1).max(64).describe("Identifiant d'instance du widget (issu de home.list_widgets)."),
  config: z.record(z.unknown()).describe('Nouvelle configuration du widget (fusionnee avec l\'existante).'),
})

const createConfigureWidgetAction = (deps: WidgetActionDeps): AiToolDefinition<z.infer<typeof configureWidgetSchema>> => ({
  name: 'home.configure_widget',
  description:
    "Modifie la configuration d'un widget existant (ex: ville d'un widget meteo, URL d'un flux). Pour les cas courants, preferer les actions dediees (weather.set_city, rss.set_feed...).",
  parameters: configureWidgetSchema,
  mutating: true,
  category: 'system',
  preview: async (args) => {
    const instance = deps.homeLayout.list().find((w) => w.id === args.id)
    return {
      title: 'Configurer un widget',
      summary: instance ? `Modifier "${widgetLabel(instance.widgetId)}"` : 'Modifier un widget',
      details: Object.entries(args.config).map(([label, value]) => ({
        label,
        value: typeof value === 'string' ? value : JSON.stringify(value),
      })),
      effect: 'La configuration du widget sera mise a jour.',
    }
  },
  execute: async (args) => {
    const instance = deps.homeLayout.list().find((w) => w.id === args.id)
    if (!instance) return { ok: false, summary: 'Widget introuvable sur l\'accueil.' }
    setWidgetConfig(deps, instance.id, { ...readConfig(instance), ...args.config })
    return { ok: true, summary: 'Configuration du widget mise a jour.' }
  },
})

export const registerHomeActions = (deps: WidgetActionDeps): void => {
  aiActionRegistry.register(createListWidgetsAction(deps))
  aiActionRegistry.register(createAddWidgetAction(deps))
  aiActionRegistry.register(createRemoveWidgetAction(deps))
  aiActionRegistry.register(createConfigureWidgetAction(deps))
}

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { AiToolDefinition } from '@shared/ai'
import { aiActionRegistry } from '../aiActionRegistry'
import {
  findWidget,
  readConfig,
  requireWidget,
  setWidgetConfig,
  truncatePreview,
  type WidgetActionDeps,
} from './homeContext'

interface TodoItem {
  id: string
  text: string
  done: boolean
  createdAt: string
}

const readTodoItems = (config: Record<string, unknown>): TodoItem[] =>
  Array.isArray(config.items) ? (config.items as TodoItem[]) : []

// ----- A faire (widget "todo", donnees dans config.items) --------------------

const createTodoListAction = (deps: WidgetActionDeps): AiToolDefinition<Record<string, never>> => ({
  name: 'todo.list',
  description: "Liste les taches du widget \"A faire\" de l'accueil.",
  parameters: z.object({}),
  mutating: false,
  category: 'system',
  execute: async () => {
    const instance = findWidget(deps, 'todo')
    if (!instance) {
      return { ok: true, summary: "Aucun widget \"A faire\" sur l'accueil.", data: { present: false, items: [] } }
    }
    const items = readTodoItems(readConfig(instance))
    return {
      ok: true,
      summary: `${items.length} tache(s) (${items.filter((item) => !item.done).length} a faire).`,
      data: { present: true, items },
    }
  },
})

const todoAddSchema = z.object({ text: z.string().trim().min(1).max(280).describe('Intitule de la tache.') })

const createTodoAddAction = (deps: WidgetActionDeps): AiToolDefinition<z.infer<typeof todoAddSchema>> => ({
  name: 'todo.add',
  description: "Ajoute une tache au widget \"A faire\".",
  parameters: todoAddSchema,
  mutating: true,
  category: 'system',
  preview: async (args) => ({
    title: 'Ajouter une tache',
    summary: args.text,
    effect: "La tache sera ajoutee au widget \"A faire\".",
  }),
  execute: async (args) => {
    const instance = requireWidget(deps, 'todo')
    const config = readConfig(instance)
    const items = readTodoItems(config)
    items.push({ id: randomUUID(), text: args.text, done: false, createdAt: new Date().toISOString() })
    setWidgetConfig(deps, instance.id, { ...config, items })
    return { ok: true, summary: `Tache ajoutee : "${args.text}".` }
  },
})

const todoIdSchema = z.object({
  id: z.string().min(1).max(64).describe('Identifiant de la tache (issu de todo.list).'),
})

const createTodoToggleAction = (deps: WidgetActionDeps): AiToolDefinition<z.infer<typeof todoIdSchema>> => ({
  name: 'todo.toggle',
  description: 'Coche ou decoche une tache (fait / a faire).',
  parameters: todoIdSchema,
  mutating: true,
  category: 'system',
  preview: async (args) => {
    const instance = requireWidget(deps, 'todo')
    const item = readTodoItems(readConfig(instance)).find((entry) => entry.id === args.id)
    return {
      title: 'Modifier une tache',
      summary: item ? `Basculer "${item.text}" (${item.done ? 'a refaire' : 'faite'})` : 'Basculer une tache',
      effect: "L'etat de la tache sera inverse.",
    }
  },
  execute: async (args) => {
    const instance = requireWidget(deps, 'todo')
    const config = readConfig(instance)
    const items = readTodoItems(config)
    const target = items.find((item) => item.id === args.id)
    if (!target) return { ok: false, summary: 'Tache introuvable.' }
    target.done = !target.done
    setWidgetConfig(deps, instance.id, { ...config, items })
    return { ok: true, summary: `Tache "${target.text}" marquee ${target.done ? 'faite' : 'a faire'}.` }
  },
})

const createTodoRemoveAction = (deps: WidgetActionDeps): AiToolDefinition<z.infer<typeof todoIdSchema>> => ({
  name: 'todo.remove',
  description: 'Supprime une tache du widget "A faire".',
  parameters: todoIdSchema,
  mutating: true,
  category: 'system',
  preview: async (args) => {
    const instance = requireWidget(deps, 'todo')
    const item = readTodoItems(readConfig(instance)).find((entry) => entry.id === args.id)
    return {
      title: 'Supprimer une tache',
      summary: item ? `Supprimer "${item.text}"` : 'Supprimer une tache',
      effect: 'La tache sera supprimee.',
    }
  },
  execute: async (args) => {
    const instance = requireWidget(deps, 'todo')
    const config = readConfig(instance)
    const items = readTodoItems(config)
    const next = items.filter((item) => item.id !== args.id)
    if (next.length === items.length) return { ok: false, summary: 'Tache introuvable.' }
    setWidgetConfig(deps, instance.id, { ...config, items: next })
    return { ok: true, summary: 'Tache supprimee.' }
  },
})

const createTodoClearDoneAction = (deps: WidgetActionDeps): AiToolDefinition<Record<string, never>> => ({
  name: 'todo.clear_done',
  description: 'Supprime toutes les taches deja faites.',
  parameters: z.object({}),
  mutating: true,
  category: 'system',
  preview: async () => {
    const instance = requireWidget(deps, 'todo')
    const done = readTodoItems(readConfig(instance)).filter((item) => item.done).length
    return {
      title: 'Effacer les taches faites',
      summary: `${done} tache(s) faite(s) seront effacees`,
      effect: 'Les taches cochees seront supprimees.',
    }
  },
  execute: async () => {
    const instance = requireWidget(deps, 'todo')
    const config = readConfig(instance)
    const items = readTodoItems(config).filter((item) => !item.done)
    setWidgetConfig(deps, instance.id, { ...config, items })
    return { ok: true, summary: 'Taches faites effacees.' }
  },
})

// ----- Notes rapides (widget "notes", donnee dans config.content) ------------

const readNotesContent = (config: Record<string, unknown>): string =>
  typeof config.content === 'string' ? config.content : ''

const createNotesReadAction = (deps: WidgetActionDeps): AiToolDefinition<Record<string, never>> => ({
  name: 'notes.read',
  description: "Lit le contenu du widget \"Notes rapides\".",
  parameters: z.object({}),
  mutating: false,
  category: 'system',
  execute: async () => {
    const instance = findWidget(deps, 'notes')
    if (!instance) {
      return { ok: true, summary: "Aucun widget \"Notes rapides\" sur l'accueil.", data: { present: false, content: '' } }
    }
    const content = readNotesContent(readConfig(instance))
    return { ok: true, summary: content ? 'Notes lues.' : 'Les notes sont vides.', data: { present: true, content } }
  },
})

const notesAppendSchema = z.object({ text: z.string().min(1).max(5000).describe('Texte a ajouter aux notes.') })

const createNotesAppendAction = (deps: WidgetActionDeps): AiToolDefinition<z.infer<typeof notesAppendSchema>> => ({
  name: 'notes.append',
  description: "Ajoute du texte a la fin des notes rapides.",
  parameters: notesAppendSchema,
  mutating: true,
  category: 'system',
  preview: async (args) => ({
    title: 'Ajouter aux notes',
    summary: truncatePreview(args.text, 200),
    effect: 'Le texte sera ajoute a la fin des notes.',
  }),
  execute: async (args) => {
    const instance = requireWidget(deps, 'notes')
    const config = readConfig(instance)
    const current = readNotesContent(config)
    const content = current ? `${current}\n${args.text}` : args.text
    setWidgetConfig(deps, instance.id, { ...config, content })
    return { ok: true, summary: 'Notes mises a jour.' }
  },
})

const notesReplaceSchema = z.object({ content: z.string().max(20000).describe('Nouveau contenu complet des notes.') })

const createNotesReplaceAction = (deps: WidgetActionDeps): AiToolDefinition<z.infer<typeof notesReplaceSchema>> => ({
  name: 'notes.replace',
  description: "Remplace integralement le contenu des notes rapides.",
  parameters: notesReplaceSchema,
  mutating: true,
  category: 'system',
  preview: async (args) => ({
    title: 'Reecrire les notes',
    summary: truncatePreview(args.content, 200),
    effect: 'Le contenu actuel des notes sera remplace.',
  }),
  execute: async (args) => {
    const instance = requireWidget(deps, 'notes')
    setWidgetConfig(deps, instance.id, { ...readConfig(instance), content: args.content })
    return { ok: true, summary: 'Notes remplacees.' }
  },
})

export const registerTodoNotesActions = (deps: WidgetActionDeps): void => {
  aiActionRegistry.register(createTodoListAction(deps))
  aiActionRegistry.register(createTodoAddAction(deps))
  aiActionRegistry.register(createTodoToggleAction(deps))
  aiActionRegistry.register(createTodoRemoveAction(deps))
  aiActionRegistry.register(createTodoClearDoneAction(deps))
  aiActionRegistry.register(createNotesReadAction(deps))
  aiActionRegistry.register(createNotesAppendAction(deps))
  aiActionRegistry.register(createNotesReplaceAction(deps))
}

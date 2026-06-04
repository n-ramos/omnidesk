import { z } from 'zod'
import type { AiToolDefinition } from '@shared/ai'
import type { ReminderRecurrence, Weekday } from '@shared/models'
import { aiActionRegistry } from '../aiActionRegistry'
import type { WidgetActionDeps } from './homeContext'

const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format attendu : HH:mm')
const weekdaySchema = z.custom<Weekday>(
  (value) => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7,
  'Jour invalide (1 = lundi ... 7 = dimanche)',
)
const recurrenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('once'), scheduledAt: z.string().datetime() }),
  z.object({ kind: z.literal('daily'), timeOfDay: timeOfDaySchema }),
  z.object({
    kind: z.literal('weekly'),
    weekdays: z.array(weekdaySchema).min(1).max(7),
    timeOfDay: timeOfDaySchema,
  }),
  z.object({
    kind: z.literal('monthly'),
    dayOfMonth: z.number().int().min(1).max(31),
    timeOfDay: timeOfDaySchema,
  }),
  z.object({ kind: z.literal('interval'), everyMinutes: z.number().int().min(1).max(20_160) }),
])

const WEEKDAY_LABELS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

// Decrit une recurrence en clair pour l'apercu de confirmation.
const describeRecurrence = (recurrence: ReminderRecurrence): string => {
  switch (recurrence.kind) {
    case 'once':
      return `une fois, le ${recurrence.scheduledAt}`
    case 'daily':
      return `tous les jours a ${recurrence.timeOfDay}`
    case 'weekly':
      return `chaque ${recurrence.weekdays.map((d) => WEEKDAY_LABELS[d]).join(', ')} a ${recurrence.timeOfDay}`
    case 'monthly':
      return `le ${recurrence.dayOfMonth} de chaque mois a ${recurrence.timeOfDay}`
    case 'interval':
      return `toutes les ${recurrence.everyMinutes} minutes`
  }
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(140).describe('Intitule du pense-bete.'),
  body: z.string().max(500).optional().describe('Detail optionnel.'),
  recurrence: recurrenceSchema.describe('Frequence : once / daily / weekly / monthly / interval.'),
})

const createCreateAction = (deps: WidgetActionDeps): AiToolDefinition<z.infer<typeof createSchema>> => ({
  name: 'reminders.create',
  description:
    "Cree un pense-bete (rappel). Frequences : une fois (once), chaque jour (daily), chaque semaine (weekly), chaque mois (monthly), ou toutes les N minutes (interval).",
  parameters: createSchema,
  mutating: true,
  category: 'system',
  preview: async (args) => ({
    title: 'Creer un pense-bete',
    summary: args.title,
    details: [{ label: 'Frequence', value: describeRecurrence(args.recurrence) }],
    effect: 'Le pense-bete sera cree et vous notifiera a l\'echeance.',
  }),
  execute: async (args) => {
    const reminder = deps.reminders.create({
      title: args.title,
      body: args.body,
      recurrence: args.recurrence,
    })
    return {
      ok: true,
      summary: `Pense-bete "${reminder.title}" cree (${describeRecurrence(reminder.recurrence)}).`,
      data: { id: reminder.id, nextOccurrenceAt: reminder.nextOccurrenceAt },
    }
  },
})

const createListAction = (deps: WidgetActionDeps): AiToolDefinition<Record<string, never>> => ({
  name: 'reminders.list',
  description: 'Liste les pense-betes (rappels) existants avec leur frequence et leur etat.',
  parameters: z.object({}),
  mutating: false,
  category: 'system',
  execute: async () => {
    const reminders = deps.reminders.list()
    return {
      ok: true,
      summary: `${reminders.length} pense-bete(s).`,
      data: {
        reminders: reminders.map((reminder) => ({
          id: reminder.id,
          title: reminder.title,
          frequence: describeRecurrence(reminder.recurrence),
          enabled: reminder.isEnabled,
          nextOccurrenceAt: reminder.nextOccurrenceAt,
        })),
      },
    }
  },
})

const updateSchema = z.object({
  id: z.string().uuid().describe('Identifiant du pense-bete (issu de reminders.list).'),
  title: z.string().trim().min(1).max(140).optional(),
  body: z.string().max(500).optional(),
  recurrence: recurrenceSchema.optional(),
})

const createUpdateAction = (deps: WidgetActionDeps): AiToolDefinition<z.infer<typeof updateSchema>> => ({
  name: 'reminders.update',
  description: 'Modifie un pense-bete existant (intitule, detail et/ou frequence).',
  parameters: updateSchema,
  mutating: true,
  category: 'system',
  preview: async (args) => {
    const current = deps.reminders.list().find((reminder) => reminder.id === args.id)
    const details: Array<{ label: string; value: string }> = []
    if (args.title) details.push({ label: 'Nouvel intitule', value: args.title })
    if (args.recurrence) details.push({ label: 'Nouvelle frequence', value: describeRecurrence(args.recurrence) })
    return {
      title: 'Modifier un pense-bete',
      summary: current ? `Modifier "${current.title}"` : 'Modifier un pense-bete',
      details,
      effect: 'Le pense-bete sera mis a jour.',
    }
  },
  execute: async (args) => {
    const reminder = deps.reminders.update({
      id: args.id,
      title: args.title,
      body: args.body,
      recurrence: args.recurrence,
    })
    return { ok: true, summary: `Pense-bete "${reminder.title}" mis a jour.` }
  },
})

const toggleSchema = z.object({
  id: z.string().uuid().describe('Identifiant du pense-bete (issu de reminders.list).'),
  enabled: z.boolean().describe('true pour activer, false pour desactiver.'),
})

const createToggleAction = (deps: WidgetActionDeps): AiToolDefinition<z.infer<typeof toggleSchema>> => ({
  name: 'reminders.toggle',
  description: 'Active ou desactive un pense-bete.',
  parameters: toggleSchema,
  mutating: true,
  category: 'system',
  preview: async (args) => {
    const current = deps.reminders.list().find((reminder) => reminder.id === args.id)
    return {
      title: args.enabled ? 'Activer un pense-bete' : 'Desactiver un pense-bete',
      summary: current ? `"${current.title}"` : 'Pense-bete',
      effect: args.enabled ? 'Le pense-bete sera active.' : 'Le pense-bete sera desactive.',
    }
  },
  execute: async (args) => {
    const reminder = deps.reminders.update({ id: args.id, isEnabled: args.enabled })
    return { ok: true, summary: `Pense-bete "${reminder.title}" ${args.enabled ? 'active' : 'desactive'}.` }
  },
})

const deleteSchema = z.object({
  id: z.string().uuid().describe('Identifiant du pense-bete a supprimer (issu de reminders.list).'),
})

const createDeleteAction = (deps: WidgetActionDeps): AiToolDefinition<z.infer<typeof deleteSchema>> => ({
  name: 'reminders.delete',
  description: 'Supprime un pense-bete.',
  parameters: deleteSchema,
  mutating: true,
  category: 'system',
  preview: async (args) => {
    const current = deps.reminders.list().find((reminder) => reminder.id === args.id)
    return {
      title: 'Supprimer un pense-bete',
      summary: current ? `Supprimer "${current.title}"` : 'Supprimer un pense-bete',
      effect: 'Le pense-bete sera supprime definitivement.',
    }
  },
  execute: async (args) => {
    deps.reminders.delete(args.id)
    return { ok: true, summary: 'Pense-bete supprime.' }
  },
})

export const registerReminderActions = (deps: WidgetActionDeps): void => {
  aiActionRegistry.register(createListAction(deps))
  aiActionRegistry.register(createCreateAction(deps))
  aiActionRegistry.register(createUpdateAction(deps))
  aiActionRegistry.register(createToggleAction(deps))
  aiActionRegistry.register(createDeleteAction(deps))
}

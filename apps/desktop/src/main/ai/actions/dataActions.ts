import { z } from 'zod'
import type { AiToolDefinition } from '@shared/ai'
import { weatherService } from '@main/providers/weatherService'
import { rssService } from '@main/providers/rssService'
import { aiActionRegistry } from '../aiActionRegistry'
import type { WidgetActionDeps } from './homeContext'

// ----- Meteo (lecture) -------------------------------------------------------
const weatherGetSchema = z.object({ city: z.string().trim().min(1).max(120).describe('Ville recherchee.') })

const createWeatherGetAction = (): AiToolDefinition<z.infer<typeof weatherGetSchema>> => ({
  name: 'weather.get',
  description: 'Recupere la meteo actuelle pour une ville donnee.',
  parameters: weatherGetSchema,
  mutating: false,
  category: 'misc',
  execute: async (args) => {
    const snapshot = await weatherService.fetch({ query: args.city })
    return {
      ok: true,
      summary: `Meteo de ${snapshot.locationName}${
        snapshot.temperature !== null ? ` : ${snapshot.temperature}${snapshot.temperatureUnit}` : ''
      }.`,
      data: {
        location: snapshot.locationName,
        temperature: snapshot.temperature,
        unit: snapshot.temperatureUnit,
        windSpeed: snapshot.windSpeed,
        humidity: snapshot.humidity,
        weatherCode: snapshot.weatherCode,
        isDay: snapshot.isDay,
      },
    }
  },
})

// ----- RSS (lecture) ---------------------------------------------------------
const rssReadSchema = z.object({
  url: z.string().trim().url().max(2048).describe('URL du flux RSS/Atom.'),
  limit: z.number().int().min(1).max(20).optional().describe('Nombre maximum d\'articles (defaut 8).'),
})

const createRssReadAction = (): AiToolDefinition<z.infer<typeof rssReadSchema>> => ({
  name: 'rss.read',
  description: 'Lit les derniers articles d\'un flux RSS/Atom (titre, lien, date, resume).',
  parameters: rssReadSchema,
  mutating: false,
  category: 'misc',
  execute: async (args) => {
    const feed = await rssService.fetch(args.url, args.limit ?? 8)
    return {
      ok: true,
      summary: `${feed.items.length} article(s) depuis "${feed.title}".`,
      data: {
        title: feed.title,
        items: feed.items.map((item) => ({
          title: item.title,
          link: item.link,
          publishedAt: item.publishedAt,
          summary: item.summary,
        })),
      },
    }
  },
})

// ----- Notifications ---------------------------------------------------------
const notificationsListSchema = z.object({
  unreadOnly: z.boolean().optional().describe('Limiter aux notifications non lues.'),
  limit: z.number().int().min(1).max(50).optional().describe('Nombre maximum (defaut 20).'),
})

const createNotificationsListAction = (deps: WidgetActionDeps): AiToolDefinition<z.infer<typeof notificationsListSchema>> => ({
  name: 'notifications.list',
  description: 'Liste les notifications recentes.',
  parameters: notificationsListSchema,
  mutating: false,
  category: 'system',
  execute: async (args) => {
    const notifications = deps.notifications
      .list({ unreadOnly: args.unreadOnly })
      .slice(0, args.limit ?? 20)
    return {
      ok: true,
      summary: `${notifications.length} notification(s).`,
      data: {
        notifications: notifications.map((notification) => ({
          id: notification.id,
          title: notification.title,
          body: notification.body,
          level: notification.level,
          createdAt: notification.createdAt,
          read: Boolean(notification.readAt),
        })),
      },
    }
  },
})

const notificationMarkReadSchema = z.object({
  id: z.string().uuid().describe('Identifiant de la notification (issu de notifications.list).'),
})

const createNotificationsMarkReadAction = (deps: WidgetActionDeps): AiToolDefinition<z.infer<typeof notificationMarkReadSchema>> => ({
  name: 'notifications.mark_read',
  description: 'Marque une notification comme lue.',
  parameters: notificationMarkReadSchema,
  mutating: true,
  category: 'system',
  preview: async () => ({
    title: 'Marquer une notification comme lue',
    summary: 'La notification sera marquee comme lue',
    effect: 'La notification passera en lue.',
  }),
  execute: async (args) => {
    deps.notifications.markRead(args.id)
    return { ok: true, summary: 'Notification marquee comme lue.' }
  },
})

const createNotificationsClearAction = (deps: WidgetActionDeps): AiToolDefinition<Record<string, never>> => ({
  name: 'notifications.clear',
  description: 'Efface toutes les notifications.',
  parameters: z.object({}),
  mutating: true,
  category: 'system',
  preview: async () => ({
    title: 'Effacer les notifications',
    summary: 'Toutes les notifications seront effacees',
    effect: 'Toutes les notifications seront supprimees.',
  }),
  execute: async () => {
    const cleared = deps.notifications.clearAll()
    return { ok: true, summary: `${cleared} notification(s) effacee(s).` }
  },
})

// ----- Comptes ---------------------------------------------------------------
const createAccountsStatusAction = (deps: WidgetActionDeps): AiToolDefinition<Record<string, never>> => ({
  name: 'accounts.status',
  description: 'Donne l\'etat de chaque compte connecte (statut, derniere synchronisation).',
  parameters: z.object({}),
  mutating: false,
  category: 'system',
  execute: async () => {
    const accounts = deps.accounts.list()
    return {
      ok: true,
      summary: `${accounts.length} compte(s).`,
      data: {
        accounts: accounts.map((account) => ({
          id: account.id,
          label: account.label,
          providerId: account.providerId,
          status: account.setupStatus,
          lastSyncAt: account.lastSyncAt,
        })),
      },
    }
  },
})

const accountsRefreshSchema = z.object({
  accountId: z.string().uuid().optional().describe('Compte a synchroniser ; si absent, tous les comptes connectes.'),
})

const createAccountsRefreshAction = (deps: WidgetActionDeps): AiToolDefinition<z.infer<typeof accountsRefreshSchema>> => ({
  name: 'accounts.refresh',
  description: 'Synchronise un compte (ou tous les comptes connectes si aucun n\'est precise).',
  parameters: accountsRefreshSchema,
  mutating: true,
  category: 'system',
  preview: async (args) => {
    const target = args.accountId
      ? deps.accounts.list().find((account) => account.id === args.accountId)?.label ?? 'ce compte'
      : 'tous les comptes connectes'
    return {
      title: 'Synchroniser',
      summary: `Synchroniser ${target}`,
      effect: 'Une synchronisation sera lancee.',
    }
  },
  execute: async (args) => {
    const targets = args.accountId
      ? deps.accounts.list().filter((account) => account.id === args.accountId)
      : deps.accounts.list().filter((account) => account.setupStatus === 'connected')
    let synced = 0
    for (const account of targets) {
      try {
        await deps.providerConnections.refreshAccount(account.id)
        synced += 1
      } catch {
        // On continue : un compte non synchronisable ne doit pas bloquer les autres.
      }
    }
    return { ok: true, summary: `${synced} compte(s) synchronise(s).` }
  },
})

// ----- Resume des non-lus ----------------------------------------------------
const createUnreadSummaryAction = (deps: WidgetActionDeps): AiToolDefinition<Record<string, never>> => ({
  name: 'inbox.unread_summary',
  description: 'Resume le nombre de messages non lus par compte.',
  parameters: z.object({}),
  mutating: false,
  category: 'system',
  execute: async () => {
    const labels = new Map(deps.accounts.list().map((account) => [account.id, account.label]))
    const byAccount = new Map<string, number>()
    for (const conversation of deps.conversations.list()) {
      if (conversation.unreadCount > 0) {
        byAccount.set(conversation.accountId, (byAccount.get(conversation.accountId) ?? 0) + conversation.unreadCount)
      }
    }
    const accounts = [...byAccount.entries()].map(([accountId, unread]) => ({
      account: labels.get(accountId) ?? accountId,
      unread,
    }))
    const total = accounts.reduce((sum, entry) => sum + entry.unread, 0)
    return { ok: true, summary: `${total} message(s) non lu(s) au total.`, data: { total, accounts } }
  },
})

// ----- Activite du jour ------------------------------------------------------
const createActivityTodayAction = (deps: WidgetActionDeps): AiToolDefinition<Record<string, never>> => ({
  name: 'activity.today',
  description: 'Compare le nombre de notifications recues aujourd\'hui et hier.',
  parameters: z.object({}),
  mutating: false,
  category: 'system',
  execute: async () => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const startOfYesterday = startOfToday - 86_400_000
    let today = 0
    let yesterday = 0
    for (const notification of deps.notifications.list()) {
      const time = new Date(notification.createdAt).getTime()
      if (time >= startOfToday) today += 1
      else if (time >= startOfYesterday) yesterday += 1
    }
    return {
      ok: true,
      summary: `${today} aujourd'hui, ${yesterday} hier.`,
      data: { today, yesterday, trend: today - yesterday },
    }
  },
})

export const registerDataActions = (deps: WidgetActionDeps): void => {
  aiActionRegistry.register(createWeatherGetAction())
  aiActionRegistry.register(createRssReadAction())
  aiActionRegistry.register(createNotificationsListAction(deps))
  aiActionRegistry.register(createNotificationsMarkReadAction(deps))
  aiActionRegistry.register(createNotificationsClearAction(deps))
  aiActionRegistry.register(createAccountsStatusAction(deps))
  aiActionRegistry.register(createAccountsRefreshAction(deps))
  aiActionRegistry.register(createUnreadSummaryAction(deps))
  aiActionRegistry.register(createActivityTodayAction(deps))
}

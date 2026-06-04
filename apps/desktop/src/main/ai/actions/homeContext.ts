import { randomUUID } from 'node:crypto'
import { AppError } from '@shared/errors'
import type { HomeWidgetInstance } from '@shared/models'
import { eventBus } from '@main/events/eventBus'
import type { HomeLayoutRepository } from '@main/database/repositories/homeLayoutRepository'
import type { ReminderScheduler } from '@main/reminders/reminderScheduler'
import type { NotificationRepository } from '@main/database/repositories/notificationRepository'
import type { AccountRepository } from '@main/database/repositories/accountRepository'
import type { ConversationRepository } from '@main/database/repositories/conversationRepository'
import type { ProviderConnectionService } from '@main/providers/providerConnectionService'

// Dependances injectees aux actions liees aux widgets / a l'accueil (services existants reutilises).
export interface WidgetActionDeps {
  homeLayout: HomeLayoutRepository
  reminders: ReminderScheduler
  notifications: NotificationRepository
  accounts: AccountRepository
  conversations: ConversationRepository
  providerConnections: ProviderConnectionService
}

const GRID_COLS = 12

// Identifiants de widgets connus (miroir du registre renderer) : sert a valider home.add_widget.
export const WIDGET_ID_VALUES = [
  'clock',
  'weather',
  'unread-by-account',
  'recent-notifications',
  'iframe',
  'accounts-status',
  'notes',
  'rss',
  'daily-activity',
  'todo',
  'reminders',
  'countdown',
  'quote',
] as const

export type WidgetId = (typeof WIDGET_ID_VALUES)[number]

export const WIDGET_LABELS: Record<WidgetId, string> = {
  clock: 'Heure',
  weather: 'Meteo',
  'unread-by-account': 'Messages non lus',
  'recent-notifications': 'Notifications recentes',
  iframe: 'Iframe',
  'accounts-status': 'Etat des comptes',
  notes: 'Notes rapides',
  rss: 'Flux RSS',
  'daily-activity': 'Activite du jour',
  todo: 'A faire',
  reminders: 'Pense-bete',
  countdown: 'Compte a rebours',
  quote: 'Citation du jour',
}

// Tailles par defaut (miroir du registre renderer) pour poser un widget ajoute par l'IA.
const WIDGET_DEFAULT_SIZES: Record<WidgetId, { w: number; h: number }> = {
  clock: { w: 4, h: 4 },
  weather: { w: 4, h: 5 },
  'unread-by-account': { w: 5, h: 6 },
  'recent-notifications': { w: 5, h: 7 },
  iframe: { w: 6, h: 8 },
  'accounts-status': { w: 5, h: 6 },
  notes: { w: 4, h: 6 },
  rss: { w: 5, h: 7 },
  'daily-activity': { w: 4, h: 6 },
  todo: { w: 4, h: 6 },
  reminders: { w: 5, h: 7 },
  countdown: { w: 5, h: 5 },
  quote: { w: 5, h: 4 },
}

export const widgetLabel = (widgetId: string): string =>
  WIDGET_LABELS[widgetId as WidgetId] ?? widgetId

// Coupe un texte trop long pour l'apercu de confirmation.
export const truncatePreview = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}...` : text

// Notifie le renderer que la disposition de l'accueil a change, pour un rafraichissement en direct.
export const notifyHomeUpdated = (): void => {
  eventBus.emit('home:updated', {})
}

export const findWidget = (
  deps: WidgetActionDeps,
  widgetId: string,
): HomeWidgetInstance | undefined => deps.homeLayout.list().find((w) => w.widgetId === widgetId)

// Recupere l'instance d'un widget present sur l'accueil, sinon echoue avec un message clair :
// le modele saura qu'il faut d'abord proposer de l'ajouter (home.add_widget).
export const requireWidget = (deps: WidgetActionDeps, widgetId: WidgetId): HomeWidgetInstance => {
  const instance = findWidget(deps, widgetId)
  if (!instance) {
    throw new AppError(
      'VALIDATION_FAILED',
      `Le widget "${WIDGET_LABELS[widgetId]}" n'est pas present sur l'accueil. Proposez de l'ajouter (home.add_widget) avant d'agir dessus.`,
    )
  }
  return instance
}

export const readConfig = (instance: HomeWidgetInstance): Record<string, unknown> =>
  instance.config ?? {}

// Remplace la config d'une instance, persiste et notifie le renderer.
export const setWidgetConfig = (
  deps: WidgetActionDeps,
  instanceId: string,
  nextConfig: Record<string, unknown>,
): void => {
  const widgets = deps.homeLayout.list()
  deps.homeLayout.replaceAll(
    widgets.map((w) => (w.id === instanceId ? { ...w, config: nextConfig } : w)),
  )
  notifyHomeUpdated()
}

// Ajoute un widget en bas de la grille de l'accueil.
export const addWidgetInstance = (
  deps: WidgetActionDeps,
  widgetId: WidgetId,
  config?: Record<string, unknown>,
): HomeWidgetInstance => {
  const widgets = deps.homeLayout.list()
  const size = WIDGET_DEFAULT_SIZES[widgetId]
  const bottom = widgets.reduce((max, w) => Math.max(max, w.y + w.h), 0)
  const instance: HomeWidgetInstance = {
    id: randomUUID(),
    widgetId,
    x: 0,
    y: bottom,
    w: Math.min(size.w, GRID_COLS),
    h: size.h,
    config,
  }
  deps.homeLayout.replaceAll([...widgets, instance])
  notifyHomeUpdated()
  return instance
}

export const removeWidgetInstance = (deps: WidgetActionDeps, instanceId: string): boolean => {
  const widgets = deps.homeLayout.list()
  const next = widgets.filter((w) => w.id !== instanceId)
  if (next.length === widgets.length) return false
  deps.homeLayout.replaceAll(next)
  notifyHomeUpdated()
  return true
}

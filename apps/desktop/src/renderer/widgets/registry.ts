import type { WidgetDefinition } from './contract'
import AccountsStatusWidget from './AccountsStatusWidget.vue'
import ClockWidget from './ClockWidget.vue'
import CountdownWidget from './CountdownWidget.vue'
import DailyActivityWidget from './DailyActivityWidget.vue'
import IframeWidget from './IframeWidget.vue'
import NotesWidget from './NotesWidget.vue'
import QuoteWidget from './QuoteWidget.vue'
import RecentNotificationsWidget from './RecentNotificationsWidget.vue'
import RemindersWidget from './RemindersWidget.vue'
import RssWidget from './RssWidget.vue'
import TodoWidget from './TodoWidget.vue'
import UnreadByAccountWidget from './UnreadByAccountWidget.vue'
import WeatherWidget from './WeatherWidget.vue'

export const widgetDefinitions: WidgetDefinition[] = [
  {
    id: 'clock',
    name: 'Heure',
    description: 'Heure courante et date du jour.',
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    component: ClockWidget,
  },
  {
    id: 'weather',
    name: 'Meteo',
    description: 'Conditions meteo pour une ville de votre choix.',
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 4 },
    component: WeatherWidget,
  },
  {
    id: 'unread-by-account',
    name: 'Messages non lus',
    description: 'Compteur de messages non lus pour chaque compte.',
    defaultSize: { w: 5, h: 6 },
    minSize: { w: 4, h: 4 },
    component: UnreadByAccountWidget,
  },
  {
    id: 'recent-notifications',
    name: 'Notifications recentes',
    description: 'Les six dernieres notifications recues.',
    defaultSize: { w: 5, h: 7 },
    minSize: { w: 4, h: 4 },
    component: RecentNotificationsWidget,
  },
  {
    id: 'iframe',
    name: 'Iframe',
    description: 'Affiche une page web embarquee (dashboard, app, intranet, etc.).',
    defaultSize: { w: 6, h: 8 },
    minSize: { w: 4, h: 5 },
    component: IframeWidget,
  },
  {
    id: 'accounts-status',
    name: 'Etat des comptes',
    description: 'Statut et derniere synchro de chaque compte connecte.',
    defaultSize: { w: 5, h: 6 },
    minSize: { w: 4, h: 4 },
    component: AccountsStatusWidget,
  },
  {
    id: 'notes',
    name: 'Notes rapides',
    description: 'Bloc-notes simple persiste avec le widget.',
    defaultSize: { w: 4, h: 6 },
    minSize: { w: 3, h: 4 },
    component: NotesWidget,
  },
  {
    id: 'rss',
    name: 'Flux RSS',
    description: 'Affiche les derniers articles d\'un flux RSS ou Atom.',
    defaultSize: { w: 5, h: 7 },
    minSize: { w: 4, h: 5 },
    component: RssWidget,
  },
  {
    id: 'daily-activity',
    name: 'Activite du jour',
    description: 'Compteur de notifications du jour et comparaison avec hier.',
    defaultSize: { w: 4, h: 6 },
    minSize: { w: 3, h: 4 },
    component: DailyActivityWidget,
  },
  {
    id: 'todo',
    name: 'A faire',
    description: 'Liste de taches simples persistee avec le widget.',
    defaultSize: { w: 4, h: 6 },
    minSize: { w: 3, h: 4 },
    component: TodoWidget,
  },
  {
    id: 'reminders',
    name: 'Pense-bete',
    description: 'Rappels ponctuels ou recurrents, avec notifications natives.',
    defaultSize: { w: 5, h: 7 },
    minSize: { w: 4, h: 5 },
    component: RemindersWidget,
  },
  {
    id: 'countdown',
    name: 'Compte a rebours',
    description: 'Temps restant avant une date importante.',
    defaultSize: { w: 5, h: 5 },
    minSize: { w: 4, h: 4 },
    component: CountdownWidget,
  },
  {
    id: 'quote',
    name: 'Citation du jour',
    description: 'Une citation francaise differente chaque jour.',
    defaultSize: { w: 5, h: 4 },
    minSize: { w: 3, h: 3 },
    component: QuoteWidget,
  },
]

const definitionsById = new Map(widgetDefinitions.map((entry) => [entry.id, entry]))

export const getWidgetDefinition = (id: string): WidgetDefinition | undefined =>
  definitionsById.get(id)

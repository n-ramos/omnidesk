import { Menu, type MenuItemConstructorOptions } from 'electron'
import {
  DEFAULT_NAV_SHORTCUTS,
  DEFAULT_SHORTCUTS,
  NAV_SHORTCUT_ACTIONS,
  type AppNavShortcutAction,
  type OmniBrowserShortcutAction,
} from '@shared/shortcuts'

/**
 * Menu applicatif personnalise. Il remplace le menu par defaut d'Electron (qui liait
 * Cmd+R au rechargement de l'app entiere). Les accelerateurs de menu se declenchent meme
 * quand un <webview> a le focus, ce qui permet de router les raccourcis (navigateur ET
 * navigation entre apps) vers le renderer plutot que vers l'app Electron. On conserve le
 * menu Edition (copier/coller) indispensable aux champs texte.
 *
 * Les accelerateurs sont parametrables : installAppMenu enregistre les routeurs d'action,
 * puis rebuildAppMenu reconstruit le menu quand l'utilisateur remappe ses raccourcis.
 */
type BrowserShortcutMap = Record<OmniBrowserShortcutAction, string>
type NavShortcutMap = Record<AppNavShortcutAction, string>

interface MenuRouters {
  browser: (action: OmniBrowserShortcutAction) => void
  nav: (action: AppNavShortcutAction) => void
}

let routers: MenuRouters | undefined
let browserShortcuts: BrowserShortcutMap = DEFAULT_SHORTCUTS
let navShortcuts: NavShortcutMap = DEFAULT_NAV_SHORTCUTS

const buildMenu = (): void => {
  const current = routers
  if (!current) {
    return
  }
  const sendBrowser = current.browser
  const sendNav = current.nav

  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({ role: 'appMenu' })
  }

  template.push({
    label: 'Fichier',
    submenu: [
      {
        label: 'Nouvel onglet',
        accelerator: browserShortcuts['new-tab'],
        click: () => sendBrowser('new-tab'),
      },
      {
        label: "Fermer l'onglet",
        accelerator: browserShortcuts['close-tab'],
        click: () => sendBrowser('close-tab'),
      },
      ...(isMac
        ? []
        : ([{ type: 'separator' }, { role: 'quit' }] as MenuItemConstructorOptions[])),
    ],
  })

  template.push({ role: 'editMenu' })

  template.push({
    label: 'Affichage',
    submenu: [
      {
        label: 'Recharger la page',
        accelerator: browserShortcuts['reload'],
        click: () => sendBrowser('reload'),
      },
      {
        label: 'Forcer le rechargement',
        accelerator: browserShortcuts['hard-reload'],
        click: () => sendBrowser('hard-reload'),
      },
      {
        label: "Barre d'adresse",
        accelerator: browserShortcuts['focus-omnibox'],
        click: () => sendBrowser('focus-omnibox'),
      },
      {
        label: 'Barre latérale',
        accelerator: browserShortcuts['toggle-sidebar'],
        click: () => sendBrowser('toggle-sidebar'),
      },
      { type: 'separator' },
      {
        label: 'Page précédente',
        accelerator: browserShortcuts['back'],
        click: () => sendBrowser('back'),
      },
      {
        label: 'Page suivante',
        accelerator: browserShortcuts['forward'],
        click: () => sendBrowser('forward'),
      },
      { type: 'separator' },
      {
        label: 'Outils de développement (page)',
        accelerator: browserShortcuts['devtools'],
        click: () => sendBrowser('devtools'),
      },
      { role: 'togglefullscreen' },
    ],
  })

  // Navigation rapide vers les apps du rail (Cmd/Ctrl+1..9). Les items restent
  // toujours presents : si le slot est vide, le renderer ignore simplement l'action.
  template.push({
    label: 'Aller à',
    submenu: NAV_SHORTCUT_ACTIONS.map((action, index) => ({
      label: `App ${index + 1}`,
      accelerator: navShortcuts[action],
      click: () => sendNav(action),
    })),
  })

  template.push({
    label: 'Fenêtre',
    submenu: isMac
      ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
      : [{ role: 'minimize' }, { role: 'zoom' }],
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

export const installAppMenu = (nextRouters: MenuRouters): void => {
  routers = nextRouters
  buildMenu()
}

// Reconstruit le menu avec de nouveaux accelerateurs (apres remappage). On ne met a
// jour que les maps fournies : appeler sans argument rebatit le menu a l'identique.
// Sans effet si installAppMenu n'a pas encore enregistre les routeurs d'action.
export const rebuildAppMenu = (shortcuts?: {
  browser?: BrowserShortcutMap
  nav?: NavShortcutMap
}): void => {
  if (shortcuts?.browser) {
    browserShortcuts = shortcuts.browser
  }
  if (shortcuts?.nav) {
    navShortcuts = shortcuts.nav
  }
  buildMenu()
}

// Retire le menu applicatif le temps de capturer une combinaison dans l'UI : sinon
// les accelerateurs natifs (Cmd+R, Cmd+1...) intercepteraient la frappe avant le
// renderer. A restaurer ensuite via rebuildAppMenu().
export const suspendAppMenu = (): void => {
  Menu.setApplicationMenu(null)
}

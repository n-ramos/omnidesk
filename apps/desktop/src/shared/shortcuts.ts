// Module feuille (aucun import) : source unique des raccourcis OmniBrowser.
// Partage entre le main (menu applicatif), le preload/ipc et le renderer (UI + capture).
// Garde models.ts/ipc.ts sans cycle d'import.

export const SHORTCUT_ACTIONS = [
  'new-tab',
  'close-tab',
  'reload',
  'hard-reload',
  'focus-omnibox',
  'back',
  'forward',
  'toggle-sidebar',
  'devtools',
] as const

export type OmniBrowserShortcutAction = (typeof SHORTCUT_ACTIONS)[number]

export interface ShortcutDef {
  action: OmniBrowserShortcutAction
  label: string
  defaultAccelerator: string
}

// Libelles et accelerateurs par defaut, repris du menu applicatif (appMenu.ts).
export const SHORTCUT_DEFS: readonly ShortcutDef[] = [
  { action: 'new-tab', label: 'Nouvel onglet', defaultAccelerator: 'CmdOrCtrl+T' },
  { action: 'close-tab', label: "Fermer l'onglet", defaultAccelerator: 'CmdOrCtrl+W' },
  { action: 'reload', label: 'Recharger la page', defaultAccelerator: 'CmdOrCtrl+R' },
  { action: 'hard-reload', label: 'Forcer le rechargement', defaultAccelerator: 'CmdOrCtrl+Shift+R' },
  { action: 'focus-omnibox', label: "Barre d'adresse", defaultAccelerator: 'CmdOrCtrl+L' },
  { action: 'back', label: 'Page précédente', defaultAccelerator: 'CmdOrCtrl+[' },
  { action: 'forward', label: 'Page suivante', defaultAccelerator: 'CmdOrCtrl+]' },
  { action: 'toggle-sidebar', label: 'Barre latérale', defaultAccelerator: 'CmdOrCtrl+S' },
  { action: 'devtools', label: 'Outils de développement', defaultAccelerator: 'CmdOrCtrl+Alt+I' },
]

export const DEFAULT_SHORTCUTS: Record<OmniBrowserShortcutAction, string> = SHORTCUT_DEFS.reduce(
  (acc, def) => {
    acc[def.action] = def.defaultAccelerator
    return acc
  },
  {} as Record<OmniBrowserShortcutAction, string>,
)

const MODIFIER_TOKENS = new Set([
  'CmdOrCtrl',
  'CommandOrControl',
  'Cmd',
  'Command',
  'Ctrl',
  'Control',
  'Alt',
  'Option',
  'AltGr',
  'Shift',
  'Super',
  'Meta',
])

// Touches finales acceptees (hors lettres A-Z, chiffres 0-9 et F1-F24, geres par regex).
const SPECIAL_KEYS = new Set([
  'Space',
  'Tab',
  'Backspace',
  'Delete',
  'Insert',
  'Return',
  'Enter',
  'Up',
  'Down',
  'Left',
  'Right',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Escape',
  'Plus',
  '[',
  ']',
  '\\',
  ';',
  "'",
  ',',
  '.',
  '/',
  '`',
  '-',
  '=',
])

const isKeyToken = (token: string): boolean => {
  if (/^[A-Z0-9]$/.test(token)) {
    return true
  }
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(token)) {
    return true
  }
  return SPECIAL_KEYS.has(token)
}

const isFunctionKey = (token: string): boolean => /^F([1-9]|1[0-9]|2[0-4])$/.test(token)

// Valide un accelerateur Electron : N modificateurs + une touche finale.
// On exige au moins un modificateur, sauf pour les touches de fonction (F1-F24).
export const isValidAccelerator = (accelerator: string): boolean => {
  if (typeof accelerator !== 'string' || accelerator.length === 0) {
    return false
  }
  const parts = accelerator.split('+')
  if (parts.some((part) => part.length === 0)) {
    return false
  }
  const key = parts[parts.length - 1]
  const modifiers = parts.slice(0, -1)
  if (key === undefined || !isKeyToken(key) || MODIFIER_TOKENS.has(key)) {
    return false
  }
  if (!modifiers.every((modifier) => MODIFIER_TOKENS.has(modifier))) {
    return false
  }
  return modifiers.length > 0 || isFunctionKey(key)
}

// Fusionne les overrides utilisateur avec les defauts. Seules les actions connues
// et les accelerateurs valides sont appliques : le menu recoit toujours du valide.
export const resolveShortcuts = (
  overrides?: Partial<Record<string, string>> | null,
): Record<OmniBrowserShortcutAction, string> => {
  const resolved = { ...DEFAULT_SHORTCUTS }
  if (overrides) {
    for (const action of SHORTCUT_ACTIONS) {
      const value = overrides[action]
      if (typeof value === 'string' && isValidAccelerator(value)) {
        resolved[action] = value
      }
    }
  }
  return resolved
}

// --- Navigation entre les apps du rail --------------------------------------
// Raccourcis "aller a l'app N" (1..9). Sur AZERTY, CmdOrCtrl+1 se capture en
// appuyant sur Ctrl+& : la touche physique reste Digit1, donc codeToKey la
// ramene a '1' (voir codeToKey / chordToAccelerator plus bas).
export const NAV_SHORTCUT_ACTIONS = [
  'go-to-app-1',
  'go-to-app-2',
  'go-to-app-3',
  'go-to-app-4',
  'go-to-app-5',
  'go-to-app-6',
  'go-to-app-7',
  'go-to-app-8',
  'go-to-app-9',
] as const

export type AppNavShortcutAction = (typeof NAV_SHORTCUT_ACTIONS)[number]

export interface NavShortcutDef {
  action: AppNavShortcutAction
  label: string
  defaultAccelerator: string
}

export const NAV_SHORTCUT_DEFS: readonly NavShortcutDef[] = NAV_SHORTCUT_ACTIONS.map(
  (action, index) => ({
    action,
    label: `Aller à l'app ${index + 1}`,
    defaultAccelerator: `CmdOrCtrl+${index + 1}`,
  }),
)

export const DEFAULT_NAV_SHORTCUTS: Record<AppNavShortcutAction, string> = NAV_SHORTCUT_DEFS.reduce(
  (acc, def) => {
    acc[def.action] = def.defaultAccelerator
    return acc
  },
  {} as Record<AppNavShortcutAction, string>,
)

// Index 0-based du slot vise par une action de navigation (go-to-app-1 -> 0).
export const navActionToSlotIndex = (action: AppNavShortcutAction): number =>
  NAV_SHORTCUT_ACTIONS.indexOf(action)

export const resolveNavShortcuts = (
  overrides?: Partial<Record<string, string>> | null,
): Record<AppNavShortcutAction, string> => {
  const resolved = { ...DEFAULT_NAV_SHORTCUTS }
  if (overrides) {
    for (const action of NAV_SHORTCUT_ACTIONS) {
      const value = overrides[action]
      if (typeof value === 'string' && isValidAccelerator(value)) {
        resolved[action] = value
      }
    }
  }
  return resolved
}

// --- Capture clavier (renderer) -----------------------------------------------

export interface KeyChord {
  meta: boolean
  ctrl: boolean
  alt: boolean
  shift: boolean
  code: string
}

// Codes physiques (KeyboardEvent.code) -> token de touche Electron.
const codeToKey = (code: string): string | null => {
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3)
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5)
  }
  if (/^Numpad[0-9]$/.test(code)) {
    return code.slice(6)
  }
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) {
    return code
  }
  switch (code) {
    case 'BracketLeft':
      return '['
    case 'BracketRight':
      return ']'
    case 'Backslash':
      return '\\'
    case 'Semicolon':
      return ';'
    case 'Quote':
      return "'"
    case 'Comma':
      return ','
    case 'Period':
      return '.'
    case 'Slash':
      return '/'
    case 'Backquote':
      return '`'
    case 'Minus':
      return '-'
    case 'Equal':
      return '='
    case 'Space':
      return 'Space'
    case 'Tab':
      return 'Tab'
    case 'Enter':
    case 'NumpadEnter':
      return 'Return'
    case 'Backspace':
      return 'Backspace'
    case 'Delete':
      return 'Delete'
    case 'Insert':
      return 'Insert'
    case 'ArrowUp':
      return 'Up'
    case 'ArrowDown':
      return 'Down'
    case 'ArrowLeft':
      return 'Left'
    case 'ArrowRight':
      return 'Right'
    case 'Home':
      return 'Home'
    case 'End':
      return 'End'
    case 'PageUp':
      return 'PageUp'
    case 'PageDown':
      return 'PageDown'
    case 'Escape':
      return 'Escape'
    default:
      return null
  }
}

// Construit un accelerateur Electron depuis une combinaison clavier capturee.
// Renvoie null si seule une touche morte/modificateur est enfoncee, ou si la
// combinaison resultante est invalide (ex. touche simple sans modificateur).
export const chordToAccelerator = (chord: KeyChord, isMac: boolean): string | null => {
  const key = codeToKey(chord.code)
  if (!key) {
    return null
  }
  const modifiers: string[] = []
  const primary = isMac ? chord.meta : chord.ctrl
  if (primary) {
    modifiers.push('CmdOrCtrl')
  }
  if (isMac && chord.ctrl) {
    modifiers.push('Control')
  }
  if (!isMac && chord.meta) {
    modifiers.push('Super')
  }
  if (chord.alt) {
    modifiers.push('Alt')
  }
  if (chord.shift) {
    modifiers.push('Shift')
  }
  const accelerator = [...modifiers, key].join('+')
  return isValidAccelerator(accelerator) ? accelerator : null
}

const MAC_SYMBOLS: Record<string, string> = {
  CmdOrCtrl: '⌘',
  CommandOrControl: '⌘',
  Cmd: '⌘',
  Command: '⌘',
  Meta: '⌘',
  Super: '⌘',
  Control: '⌃',
  Ctrl: '⌃',
  Alt: '⌥',
  Option: '⌥',
  Shift: '⇧',
}

const KEY_SYMBOLS: Record<string, string> = {
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Return: '⏎',
  Enter: '⏎',
  Escape: 'Esc',
  Delete: '⌦',
  Backspace: '⌫',
  Space: 'Space',
}

// Rendu lisible d'un accelerateur (symboles mac, ou Ctrl+Maj+... ailleurs).
export const formatAccelerator = (accelerator: string, isMac: boolean): string => {
  const parts = accelerator.split('+')
  const rendered = parts.map((part) => {
    if (isMac && MODIFIER_TOKENS.has(part)) {
      return MAC_SYMBOLS[part] ?? part
    }
    if (!isMac && (part === 'CmdOrCtrl' || part === 'CommandOrControl')) {
      return 'Ctrl'
    }
    if (!isMac && part === 'Shift') {
      return 'Maj'
    }
    return KEY_SYMBOLS[part] ?? part
  })
  return isMac ? rendered.join('') : rendered.join('+')
}

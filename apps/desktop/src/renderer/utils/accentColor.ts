// Couleur d'accent personnalisable de l'app.
//
// La couleur principale est pilotee par la variable CSS --accent-mint (canaux RGB),
// definie par defaut dans styles.css et reecrite a chaud ici. Comme le token Tailwind
// accent.mint pointe sur cette variable (cf. tailwind.config.ts), reecrire --accent-mint
// recolore instantanement les ~190 usages dans toute l'app, sans rebuild.
//
// Ce module ne contient que des helpers purs (aucun import Vue/Pinia) afin d'etre
// utilisable aussi bien au pre-mount (main.ts, anti-flash) que dans le store/UI.

import { hexToChannels, isValidHex, normalizeHex } from './colorUtils'

// Re-export de la math couleur partagee pour les importeurs historiques de ce module.
export { isValidHex, normalizeHex, hexToChannels, hexToHsl, hslToHex } from './colorUtils'
export type { Hsl } from './colorUtils'

export const DEFAULT_ACCENT = '#8ee6bf'

// Cache renderer pour appliquer la couleur des le premier rendu (avant que la valeur
// faisant autorite en base ne soit chargee). Meme convention que mascotStore.
const STORAGE_KEY = 'omnidesk.accentColor'

export interface AccentPreset {
  name: string
  hex: string
}

// Palette proposee en un clic : pastels clairs couvrant le spectre, tous lisibles en
// texte sur fond sombre. La menthe (defaut) est en premier.
export const ACCENT_PRESETS: AccentPreset[] = [
  { name: 'Menthe', hex: '#8ee6bf' },
  { name: 'Turquoise', hex: '#7ddfd6' },
  { name: 'Ciel', hex: '#8bbcff' },
  { name: 'Indigo', hex: '#a5b4fc' },
  { name: 'Lilas', hex: '#c6a7ff' },
  { name: 'Rose', hex: '#f7a8d8' },
  { name: 'Corail', hex: '#ff987a' },
  { name: 'Or', hex: '#f4c76f' },
]

// Applique la couleur a l'instant (variable CSS uniquement). Volontairement sans effet
// de bord persistant : appele en continu pendant un glissement de curseur pour un
// apercu temps reel fluide. La persistance (cache + base) passe par cacheAccentColor /
// le store, declenchees au commit.
export const applyAccentColor = (hex: string): void => {
  if (!isValidHex(hex)) {
    return
  }
  document.documentElement.style.setProperty('--accent-mint', hexToChannels(hex))
}

// Memorise la couleur retenue pour un demarrage sans flash. Silencieux si localStorage
// est indisponible (l'apercu et la base restent fonctionnels).
export const cacheAccentColor = (hex: string): void => {
  if (!isValidHex(hex)) {
    return
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, normalizeHex(hex))
  } catch {
    // Stockage indisponible : on ignore, la base reste la source de verite.
  }
}

// Derniere couleur connue cote renderer, sinon le defaut. Sert au pre-mount.
export const readStoredAccent = (): string => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && isValidHex(stored)) {
      return normalizeHex(stored)
    }
  } catch {
    // ignore
  }
  return DEFAULT_ACCENT
}

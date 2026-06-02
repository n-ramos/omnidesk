// Couleur de fond (le "noir de base") personnalisable.
//
// Le fond de l'app est le palette `ink` : un degrade de 7 nuances sombres (ink-950 la
// plus foncee -> ink-700). On le pilote par les variables CSS --ink-950..--ink-700
// (canaux RGB), sur lesquelles pointent les tokens Tailwind (cf. tailwind.config.ts).
//
// L'utilisateur ne choisit qu'UNE couleur de base (= ink-950) ; on en derive tout le
// degrade en conservant les ecarts de luminosite d'origine, ce qui preserve la
// profondeur de l'interface tout en la teintant. Liberte totale : aucune contrainte de
// luminosite (une base claire est permise, au risque assume de rendre le texte illisible).
//
// Helpers purs (aucun import Vue/Pinia) : utilisable au pre-mount comme dans l'UI.

import { hexToChannels, hexToHsl, hslToHex, isValidHex, normalizeHex } from './colorUtils'

export const DEFAULT_BASE = '#090a0d'

const STORAGE_KEY = 'omnidesk.baseColor'

// Nuances du palette ink, de la plus foncee a la plus claire.
export const INK_SHADES = [950, 925, 900, 850, 800, 750, 700] as const

// Ecarts de luminosite (en L% HSL) de chaque nuance par rapport a la base (ink-950),
// mesures sur le degrade d'origine. Deriver depuis #090a0d redonne le degrade initial.
const INK_L_OFFSETS = [0, 2, 5, 7, 11, 14, 19]

export interface BasePreset {
  name: string
  hex: string
}

// Ambiances sombres pretes a l'emploi (chaque hex = la base ink-950 ; le degrade en
// est derive). La couleur exacte plus bas couvre tout le reste.
export const BASE_PRESETS: BasePreset[] = [
  { name: 'Ardoise', hex: '#090a0d' },
  { name: 'Encre', hex: '#0c1530' },
  { name: 'Acier', hex: '#141d2b' },
  { name: 'Foret', hex: '#0e2418' },
  { name: 'Sarcelle', hex: '#0a2228' },
  { name: 'Prune', hex: '#18112c' },
  { name: 'Vin', hex: '#2a1019' },
  { name: 'Cafe', hex: '#241a10' },
]

export interface InkShade {
  shade: number
  hex: string
}

// Derive les 7 nuances ink depuis la base : meme teinte/saturation, luminosite decalee
// des ecarts d'origine. Retourne un hex par nuance (dans l'ordre de INK_SHADES).
export const deriveInkRamp = (baseHex: string): InkShade[] => {
  const { h, s, l } = hexToHsl(baseHex)
  return INK_SHADES.map((shade, index) => {
    const offset = INK_L_OFFSETS[index] ?? 0
    const targetL = Math.min(100, Math.max(0, l + offset))
    return { shade, hex: hslToHex(h, s, targetL) }
  })
}

// Applique le degrade a l'instant (variables CSS uniquement, sans persistance). Au
// defaut, on retire les overrides inline pour retomber sur le degrade exact de :root
// (evite toute derive d'arrondi pour qui ne personnalise pas).
export const applyBaseColor = (hex: string): void => {
  if (!isValidHex(hex)) {
    return
  }
  const root = document.documentElement.style
  if (normalizeHex(hex) === DEFAULT_BASE) {
    INK_SHADES.forEach((shade) => root.removeProperty(`--ink-${shade}`))
    return
  }
  for (const { shade, hex: shadeHex } of deriveInkRamp(hex)) {
    root.setProperty(`--ink-${shade}`, hexToChannels(shadeHex))
  }
}

// Memorise la base pour un demarrage sans flash. Silencieux si localStorage indisponible.
export const cacheBaseColor = (hex: string): void => {
  if (!isValidHex(hex)) {
    return
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, normalizeHex(hex))
  } catch {
    // Stockage indisponible : on ignore, la base reste la source de verite.
  }
}

// Derniere base connue cote renderer, sinon le defaut. Sert au pre-mount.
export const readStoredBase = (): string => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && isValidHex(stored)) {
      return normalizeHex(stored)
    }
  } catch {
    // ignore
  }
  return DEFAULT_BASE
}

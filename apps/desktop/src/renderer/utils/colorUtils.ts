// Helpers de couleur purs, partages par les themes accent et fond (accentColor.ts /
// baseColor.ts). Aucun import Vue/Pinia : utilisable au pre-mount comme dans l'UI.

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export const isValidHex = (value: string): boolean => HEX_RE.test(value.trim())

// Ramene une couleur a la forme canonique #rrggbb minuscule (accepte #rgb en entree).
export const normalizeHex = (hex: string): string => {
  let value = hex.trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(value)) {
    value = `#${value
      .slice(1)
      .split('')
      .map((c) => c + c)
      .join('')}`
  }
  return value
}

interface Rgb {
  r: number
  g: number
  b: number
}

const hexToRgb = (hex: string): Rgb => {
  const value = normalizeHex(hex)
  return {
    r: parseInt(value.slice(1, 3), 16),
    g: parseInt(value.slice(3, 5), 16),
    b: parseInt(value.slice(5, 7), 16),
  }
}

// '#8ee6bf' -> '142 230 191' (canaux separes par des espaces, format attendu par
// rgb(var(--...) / <alpha>)).
export const hexToChannels = (hex: string): string => {
  const { r, g, b } = hexToRgb(hex)
  return `${r} ${g} ${b}`
}

export interface Hsl {
  h: number // 0-360
  s: number // 0-100
  l: number // 0-100
}

export const hexToHsl = (hex: string): Hsl => {
  const { r, g, b } = hexToRgb(hex)
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min

  let h = 0
  if (delta !== 0) {
    if (max === rn) {
      h = ((gn - bn) / delta) % 6
    } else if (max === gn) {
      h = (bn - rn) / delta + 2
    } else {
      h = (rn - gn) / delta + 4
    }
    h *= 60
    if (h < 0) {
      h += 360
    }
  }

  const l = (max + min) / 2
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export const hslToHex = (h: number, s: number, l: number): string => {
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))

  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) {
    ;[r, g, b] = [c, x, 0]
  } else if (hp < 2) {
    ;[r, g, b] = [x, c, 0]
  } else if (hp < 3) {
    ;[r, g, b] = [0, c, x]
  } else if (hp < 4) {
    ;[r, g, b] = [0, x, c]
  } else if (hp < 5) {
    ;[r, g, b] = [x, 0, c]
  } else {
    ;[r, g, b] = [c, 0, x]
  }

  const m = ln - c / 2
  const toHex = (value: number): string =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, '0')

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

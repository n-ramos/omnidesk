import iamcalShortcodes from 'emojibase-data/en/shortcodes/iamcal.json'

type ShortcodeValue = string | string[]
type ShortcodeTable = Record<string, ShortcodeValue>

const shortcodes = iamcalShortcodes as ShortcodeTable

const reverseMap = new Map<string, string>()
for (const [hex, value] of Object.entries(shortcodes)) {
  const list = Array.isArray(value) ? value : [value]
  for (const name of list) {
    if (!reverseMap.has(name)) {
      reverseMap.set(name, hex)
    }
  }
}

const normalizeHex = (hex: string): string => hex.toUpperCase()

const firstShortcode = (value?: ShortcodeValue): string | undefined => {
  if (!value) {
    return undefined
  }
  return Array.isArray(value) ? value[0] : value
}

const lookupShortcode = (hex: string): string | undefined => {
  const direct = firstShortcode(shortcodes[hex])
  if (direct) {
    return direct
  }

  const stripped = hex.replace(/-FE0F$/, '').replace(/-FE0F-/g, '-')
  if (stripped !== hex) {
    const fromStripped = firstShortcode(shortcodes[stripped])
    if (fromStripped) {
      return fromStripped
    }
  }

  const withSelector = `${hex}-FE0F`
  return firstShortcode(shortcodes[withSelector])
}

export const slackShortcodeFromUnicode = (hex: string): string | undefined => {
  if (!hex) {
    return undefined
  }
  return lookupShortcode(normalizeHex(hex))
}

const hexToEmoji = (hex: string): string => {
  const codePoints = hex.split('-').map((part) => parseInt(part, 16))
  if (codePoints.some((point) => Number.isNaN(point))) {
    return ''
  }
  return String.fromCodePoint(...codePoints)
}

export const unicodeFromSlackShortcode = (name: string): string | undefined => {
  const hex = reverseMap.get(name)
  return hex ? hexToEmoji(hex) : undefined
}

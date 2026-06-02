export type StrengthTone = 'coral' | 'gold' | 'mint'

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4
  label: string
  tone: StrengthTone
}

const LABELS = ['Tres faible', 'Faible', 'Moyen', 'Bon', 'Excellent']
const TONES: StrengthTone[] = ['coral', 'coral', 'gold', 'mint', 'mint']

// Estimation heuristique (zero dependance) : entropie approchee = longueur * log2(taille du jeu de
// caracteres), ponderee par la diversite (ratio de caracteres uniques) pour penaliser les
// repetitions. Sert d'INDICATION visuelle, pas de mesure cryptographique exacte.
export const evaluatePasswordStrength = (password: string): PasswordStrength => {
  if (password.length === 0) {
    return { score: 0, label: 'Vide', tone: 'coral' }
  }
  let pool = 0
  if (/[a-z]/.test(password)) pool += 26
  if (/[A-Z]/.test(password)) pool += 26
  if (/[0-9]/.test(password)) pool += 10
  if (/[^a-zA-Z0-9]/.test(password)) pool += 32

  const bits = password.length * Math.log2(Math.max(pool, 2))
  const uniqueRatio = new Set(password).size / password.length
  const adjusted = bits * (0.5 + 0.5 * uniqueRatio)

  const score: 0 | 1 | 2 | 3 | 4 =
    adjusted < 28 ? 0 : adjusted < 40 ? 1 : adjusted < 64 ? 2 : adjusted < 96 ? 3 : 4

  return { score, label: LABELS[score] ?? '', tone: TONES[score] ?? 'coral' }
}

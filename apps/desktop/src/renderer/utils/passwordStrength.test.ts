import { describe, expect, it } from 'vitest'
import { evaluatePasswordStrength } from './passwordStrength'

describe('evaluatePasswordStrength', () => {
  it('borne le score entre 0 et 4', () => {
    for (const password of ['', 'a', 'abc', 'Password1', 'Tr0ub4dour&3xtra-Long-Pass!!']) {
      const result = evaluatePasswordStrength(password)
      expect(result.score).toBeGreaterThanOrEqual(0)
      expect(result.score).toBeLessThanOrEqual(4)
    }
  })

  it('augmente avec la longueur et la diversite', () => {
    const weak = evaluatePasswordStrength('aaaa')
    const strong = evaluatePasswordStrength('aB3$xY9!kLmN2025-vault')
    expect(strong.score).toBeGreaterThan(weak.score)
  })

  it('chaine vide = score 0', () => {
    expect(evaluatePasswordStrength('').score).toBe(0)
  })
})

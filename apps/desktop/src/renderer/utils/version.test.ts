import { describe, expect, it } from 'vitest'
import { compareVersions } from './version'

describe('compareVersions', () => {
  it('compare numeriquement major.minor.patch', () => {
    expect(compareVersions('0.2.0', '0.1.0')).toBeGreaterThan(0)
    expect(compareVersions('0.1.0', '0.2.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.2.10', '1.2.9')).toBeGreaterThan(0)
  })

  it('gere les longueurs differentes et le prefixe v', () => {
    expect(compareVersions('v1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1.2.3', '1.2')).toBeGreaterThan(0)
  })

  it('ignore les suffixes de pre-release', () => {
    expect(compareVersions('1.0.0-beta.2', '1.0.0')).toBe(0)
  })
})

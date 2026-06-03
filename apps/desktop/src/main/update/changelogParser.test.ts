import { describe, expect, it } from 'vitest'
import { parseChangelog } from './changelogParser'

const SAMPLE = `# Changelog

Texte d'introduction a ignorer.

## [Unreleased]

- ne doit pas apparaitre

## [0.2.0] - 2026-06-10

### Ajoute

- Fonctionnalite A
- Fonctionnalite B

### Corrige

- Bug C

## [0.1.0] - 2026-06-03

- Version initiale
`

describe('parseChangelog', () => {
  it('extrait les versions dans l ordre du fichier', () => {
    const entries = parseChangelog(SAMPLE)
    expect(entries.map((entry) => entry.version)).toEqual(['0.2.0', '0.1.0'])
  })

  it('ignore la section Unreleased (pas de version semver)', () => {
    const entries = parseChangelog(SAMPLE)
    expect(entries.every((entry) => /^\d+\.\d+\.\d+/.test(entry.version))).toBe(true)
  })

  it('capture la date et les sous-titres en groupes', () => {
    const [latest] = parseChangelog(SAMPLE)
    expect(latest?.date).toBe('2026-06-10')
    expect(latest?.groups).toEqual([
      { label: 'Ajoute', items: ['Fonctionnalite A', 'Fonctionnalite B'] },
      { label: 'Corrige', items: ['Bug C'] },
    ])
  })

  it('gere une version sans sous-titre (groupe sans label)', () => {
    const v010 = parseChangelog(SAMPLE).find((entry) => entry.version === '0.1.0')
    expect(v010?.groups).toEqual([{ label: null, items: ['Version initiale'] }])
  })

  it('renvoie une liste vide sur un contenu sans version', () => {
    expect(parseChangelog('# Changelog\n\nRien ici.\n')).toEqual([])
  })
})

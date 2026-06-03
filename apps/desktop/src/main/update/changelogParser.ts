import type { ChangelogEntry, ChangelogGroup } from '@shared/ipc'

// Parseur pur (sans dependance Electron) du CHANGELOG.md, au format Keep a Changelog.
// Reconnait `## [x.y.z] - date`, les sous-titres `### Label` et les puces `- ...`.
const VERSION_HEADER = /^##\s+\[?v?(\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?)\]?(?:\s*[-–]\s*(.+))?\s*$/
const GROUP_HEADER = /^###\s+(.+?)\s*$/
const BULLET = /^[-*]\s+(.+?)\s*$/

export const parseChangelog = (markdown: string): ChangelogEntry[] => {
  const entries: ChangelogEntry[] = []
  let current: ChangelogEntry | null = null
  let group: ChangelogGroup | null = null
  // Index de la puce en cours, pour y rattacher ses lignes de continuation (une puce
  // ecrite sur plusieurs lignes, le surplus etant indente sous le tiret). -1 = aucune.
  let openItem = -1

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trimEnd()

    const versionMatch = VERSION_HEADER.exec(line)
    if (versionMatch) {
      const date = versionMatch[2]?.trim() ?? ''
      current = { version: versionMatch[1] ?? '', date: date || null, groups: [] }
      group = null
      openItem = -1
      entries.push(current)
      continue
    }
    if (!current) {
      // En-tete du fichier / section "Unreleased" : ignore tant qu'aucune version n'est ouverte.
      continue
    }

    const groupMatch = GROUP_HEADER.exec(line)
    if (groupMatch) {
      group = { label: groupMatch[1] ?? '', items: [] }
      current.groups.push(group)
      openItem = -1
      continue
    }

    const bulletMatch = BULLET.exec(line)
    if (bulletMatch) {
      if (!group) {
        group = { label: null, items: [] }
        current.groups.push(group)
      }
      group.items.push(bulletMatch[1] ?? '')
      openItem = group.items.length - 1
      continue
    }

    // Ligne de continuation : texte indente qui prolonge la puce en cours. Sans ce
    // rattachement, seule la 1re ligne d'une puce multi-lignes serait gardee et la
    // puce apparaitrait tronquee en plein milieu dans la modal "Nouveautes".
    if (group && openItem >= 0 && /^\s+\S/.test(line)) {
      group.items[openItem] = `${group.items[openItem]} ${line.trim()}`
      continue
    }

    // Ligne vide : fin de la puce courante (une nouvelle puce/section recommencera a zero).
    if (line.trim() === '') {
      openItem = -1
    }
  }

  // On ne garde que les versions ayant au moins une puce.
  return entries.filter((entry) => entry.groups.some((g) => g.items.length > 0))
}

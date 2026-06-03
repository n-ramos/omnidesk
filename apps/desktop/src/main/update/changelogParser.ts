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

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trimEnd()

    const versionMatch = VERSION_HEADER.exec(line)
    if (versionMatch) {
      const date = versionMatch[2]?.trim() ?? ''
      current = { version: versionMatch[1] ?? '', date: date || null, groups: [] }
      group = null
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
      continue
    }

    const bulletMatch = BULLET.exec(line)
    if (bulletMatch) {
      if (!group) {
        group = { label: null, items: [] }
        current.groups.push(group)
      }
      group.items.push(bulletMatch[1] ?? '')
    }
  }

  // On ne garde que les versions ayant au moins une puce.
  return entries.filter((entry) => entry.groups.some((g) => g.items.length > 0))
}

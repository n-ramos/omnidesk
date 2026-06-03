/**
 * Comparaison de versions SemVer simplifiee : numerique sur major.minor.patch, les
 * suffixes de pre-release (-beta...) sont ignores. Renvoie <0 si a<b, 0 si egal, >0 si a>b.
 * Suffisant pour decider si une version installee est plus recente que la derniere vue.
 */
export const compareVersions = (a: string, b: string): number => {
  const parse = (value: string): number[] => {
    const core = value.trim().replace(/^v/, '').split('-')[0] ?? ''
    return core.split('.').map((part) => Number.parseInt(part, 10) || 0)
  }

  const left = parse(a)
  const right = parse(b)
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) {
      return diff
    }
  }
  return 0
}

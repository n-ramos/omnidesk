// Compacte un texte (espaces multiples ramenes a un seul, trim) puis tronque a
// maxLength caracteres. Renvoie undefined si l'entree est vide ou uniquement
// composee d'espaces. Utilise pour les apercus de corps de message.
export const buildTextPreview = (
  value: string | undefined,
  maxLength: number,
): string | undefined => {
  if (!value) {
    return undefined
  }
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact ? compact.slice(0, maxLength) : undefined
}

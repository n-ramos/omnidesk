export interface QuoteEntry {
  text: string
  author: string
}

export const FALLBACK_QUOTE: QuoteEntry = { text: 'Bonne journee.', author: 'Omnidesk' }

export const QUOTES: QuoteEntry[] = [
  { text: "La simplicite est la sophistication supreme.", author: 'Leonard de Vinci' },
  { text: "Le mieux est l'ennemi du bien.", author: 'Voltaire' },
  { text: "L'imagination est plus importante que le savoir.", author: 'Albert Einstein' },
  { text: "Fais de ta vie un reve, et d'un reve, une realite.", author: 'Antoine de Saint-Exupery' },
  { text: "Le succes, c'est tomber sept fois, se relever huit.", author: 'Proverbe japonais' },
  { text: "Ce qui ne te tue pas te rend plus fort.", author: 'Friedrich Nietzsche' },
  { text: "La connaissance s'acquiert par l'experience, tout le reste n'est que de l'information.", author: 'Albert Einstein' },
  { text: "Le seul moyen de faire du bon travail est d'aimer ce que vous faites.", author: 'Steve Jobs' },
  { text: "La perfection est atteinte non quand il ne reste rien a ajouter, mais quand il ne reste rien a enlever.", author: 'Antoine de Saint-Exupery' },
  { text: "Soyez le changement que vous voulez voir dans le monde.", author: 'Gandhi' },
  { text: "L'echec est le fondement de la reussite.", author: 'Lao Tseu' },
  { text: "La patience est amere, mais son fruit est doux.", author: 'Jean-Jacques Rousseau' },
  { text: "Mieux vaut allumer une bougie que de maudire l'obscurite.", author: 'Confucius' },
  { text: "Ce que l'on concoit bien s'enonce clairement.", author: 'Nicolas Boileau' },
  { text: "Le doute est le commencement de la sagesse.", author: 'Aristote' },
  { text: "La curiosite est l'un des traits permanents et certains d'une intelligence vigoureuse.", author: 'Samuel Johnson' },
  { text: "Choisissez un travail que vous aimez et vous n'aurez pas a travailler un seul jour de votre vie.", author: 'Confucius' },
  { text: "On ne voit bien qu'avec le coeur. L'essentiel est invisible pour les yeux.", author: 'Antoine de Saint-Exupery' },
  { text: "La vie c'est comme une bicyclette, il faut avancer pour ne pas perdre l'equilibre.", author: 'Albert Einstein' },
  { text: "Il n'y a pas de vent favorable pour celui qui ne sait ou il va.", author: 'Seneque' },
  { text: "Ce sont nos choix qui montrent ce que nous sommes vraiment, bien plus que nos aptitudes.", author: 'J.K. Rowling' },
  { text: "On ne peut pas dechiffrer le monde sans le lire.", author: 'Umberto Eco' },
  { text: "Le commencement est la moitie de tout.", author: 'Aristote' },
  { text: "Tout ce qui ne te tue pas te fortifie l'esprit.", author: 'Friedrich Nietzsche' },
  { text: "Le bonheur n'est pas une destination, mais une maniere de voyager.", author: 'Margaret Lee Runbeck' },
  { text: "La vraie generosite envers l'avenir consiste a tout donner au present.", author: 'Albert Camus' },
  { text: "Apprends comme si tu devais vivre toujours, vis comme si tu devais mourir demain.", author: 'Gandhi' },
  { text: "Ce qui se concoit bien s'enonce clairement, et les mots pour le dire arrivent aisement.", author: 'Nicolas Boileau' },
  { text: "Rien n'est plus dangereux qu'une idee, quand on n'a qu'une idee.", author: 'Emile-Auguste Chartier' },
  { text: "Le silence est la plus belle reponse a celui qui ne te merite pas.", author: 'Proverbe' },
  { text: "Sois le changement que tu souhaites voir dans le monde.", author: 'Gandhi' },
  { text: "Un homme qui ne perd pas la raison pour certaines choses n'en a pas a perdre.", author: 'Gotthold Ephraim Lessing' },
  { text: "La vie est courte, l'art est long.", author: 'Hippocrate' },
  { text: "Connais-toi toi-meme.", author: 'Socrate' },
  { text: "Le travail eloigne de nous trois grands maux : l'ennui, le vice et le besoin.", author: 'Voltaire' },
  { text: "L'experience est une lanterne accrochee dans le dos, qui n'eclaire que le chemin parcouru.", author: 'Confucius' },
  { text: "Le pessimiste se plaint du vent. L'optimiste espere qu'il va changer. Le realiste ajuste ses voiles.", author: 'William Arthur Ward' },
  { text: "Ne juge pas chaque jour a la moisson que tu recoltes, mais aux graines que tu semes.", author: 'Robert Louis Stevenson' },
  { text: "Le secret d'une bonne vieillesse n'est autre que d'avoir conclu un pacte honnete avec la solitude.", author: 'Gabriel Garcia Marquez' },
  { text: "L'avenir appartient a ceux qui croient a la beaute de leurs reves.", author: 'Eleanor Roosevelt' },
]

const dayOfYear = (date: Date): number => {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date.getTime() - start.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

/** Citation deterministe du jour (identique pour une meme date). */
export const dailyQuote = (date = new Date()): QuoteEntry => {
  const seed = dayOfYear(date) + date.getFullYear()
  const index = QUOTES.length > 0 ? seed % QUOTES.length : -1
  return QUOTES[index] ?? FALLBACK_QUOTE
}

/** Citation aleatoire, en evitant si possible un texte deja affiche. */
export const randomQuote = (excludeText?: string): QuoteEntry => {
  if (QUOTES.length === 0) return FALLBACK_QUOTE
  const pool = excludeText ? QUOTES.filter((quote) => quote.text !== excludeText) : QUOTES
  const list = pool.length > 0 ? pool : QUOTES
  const index = Math.floor(Math.random() * list.length)
  return list[index] ?? FALLBACK_QUOTE
}

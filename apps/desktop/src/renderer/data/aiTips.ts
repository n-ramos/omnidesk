// Suggestions de phrases comprises par l'assistant IA (Elodie), pour faire decouvrir ses
// capacites. Affichees ponctuellement par la mascotte UNIQUEMENT quand l'IA est configuree.
// Chaque phrase correspond a une action reellement supportee (rappels, taches, notes, mails,
// meteo, RSS, accueil, notifications...). FR sans diacritiques, apostrophes ASCII.
export const AI_TIPS: string[] = [
  "Essaie de me dire : ajoute un pense-bete tous les lundis a 9h",
  "Dis-moi : rappelle-moi d'appeler le client demain a 14h",
  "Demande-moi : resume mes mails non lus",
  "Essaie : ecris un mail pour proposer un rendez-vous mardi",
  "Dis-moi : archive mes mails deja lus",
  "Essaie : ajoute une tache 'preparer la reunion'",
  "Demande-moi : qu'est-ce que j'ai a faire aujourd'hui ?",
  "Essaie : note d'acheter du pain et du lait",
  "Dis-moi : mets la meteo de Lyon sur mon accueil",
  "Essaie : ajoute un compte a rebours jusqu'a vendredi",
  "Demande-moi : combien de mails non lus j'ai ?",
  "Essaie : ajoute un flux RSS d'actualites a mon accueil",
  "Dis-moi : quelles notifications aujourd'hui ?",
  "Tu peux me dire : marque ce mail comme lu",
]

// Renvoie une suggestion au hasard, en evitant si possible la derniere affichee.
export const randomAiTip = (last?: string): string => {
  if (AI_TIPS.length === 0) return ''
  const pool = last ? AI_TIPS.filter((tip) => tip !== last) : AI_TIPS
  const list = pool.length > 0 ? pool : AI_TIPS
  return list[Math.floor(Math.random() * list.length)] as string
}

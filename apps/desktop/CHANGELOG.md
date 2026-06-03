# Changelog

Toutes les modifications notables d'Omnidesk sont consignees ici. Le format suit
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le versionnage respecte
[SemVer](https://semver.org/lang/fr/).

A chaque release, ajouter une section `## [x.y.z] - AAAA-MM-JJ` en tete (sous-titres
`### Ajoute` / `### Modifie` / `### Corrige`). La modal "Nouveautes", affichee une seule
fois apres une mise a jour, reprend les sections plus recentes que la version precedente.

## [0.1.7] - 2026-06-03

### Corrige

- Appels (omnichat) de nouveau disponibles dans l'application installee : l'adresse du
  service OmniProxy est desormais integree a la version distribuee. Auparavant, en dehors
  de l'environnement de developpement, l'app affichait "Les appels sont indisponibles :
  OmniProxy n'est pas configure" et les appels etaient impossibles.

## [0.1.6] - 2026-06-03

### Corrige

- Pense-betes (rappels) de nouveau audibles : un rappel arrive a echeance joue desormais
  le son de notification de maniere fiable, meme si la mascotte Elodie est masquee ou en
  sourdine (le son ne dependait plus que d'elle, on pouvait donc rater le rappel). Un
  rappel echu pendant que l'app etait fermee declenche aussi un son a son apparition au
  demarrage.
- Modal "Nouveautes" : les nouveautes redigees sur plusieurs lignes ne sont plus coupees
  en plein milieu ; le texte complet de chaque point s'affiche.

## [0.1.5] - 2026-06-03

### Corrige

- Deverrouillage par Touch ID sur l'app installee (DMG) : il pouvait echouer avec un
  message technique ("failed to downcast any to object") au lieu de basculer proprement
  sur le mot de passe maitre. L'app reinitialise desormais sans erreur le cache
  biometrique devenu illisible et repropose d'activer Touch ID ; l'acces au coffre n'est
  plus bloque.

## [0.1.4] - 2026-06-03

### Ajoute

- Numero de version d'Omnidesk visible en bas du rail de navigation et dans les
  reglages (carte "Version"), pour savoir d'un coup d'oeil quelle version est installee.

### Corrige

- Notification native de mise a jour prete affichee en francais (elle apparaissait
  jusqu'ici en anglais).
- Rappel arrive a echeance pendant que l'app etait fermee : il declenche desormais sa
  notification au demarrage (banniere native + entree dans les notifications recentes)
  au lieu d'etre consomme silencieusement.
- Pages web integrees (Slack/Teams, onglets OmniBrowser, widgets) plus stables sur les
  longues sessions : les ecouteurs d'evenements ne s'empilent plus a chaque rechargement
  ou navigation, evitant une fuite memoire et des traitements en double.

## [0.1.3] - 2026-06-03

### Corrige

- Deverrouillage par Touch ID plus robuste : sur un build signe, la cle biometrique
  scellee sous une identite d'app anterieure pouvait empecher l'ouverture du coffre
  (erreur de dechiffrement). L'app purge desormais ce cache illisible et repropose
  d'activer Touch ID, sans jamais bloquer l'acces (le mot de passe maitre reste la
  source de verite).
- Notifications natives macOS : l'envoi et les echecs sont desormais journalises,
  pour diagnostiquer plus facilement les notifications manquantes.

## [0.1.1] - 2026-06-03

### Corrige

- Demarrage plus robuste : si la cle de chiffrement locale ne peut pas etre lue, l'app
  affiche desormais un message clair au lieu de rester inerte avec des fonctions qui
  echouent toutes (sauvegarde, comptes, coffre...).

### Modifie

- Identite interne de l'app fixee a "Omnidesk" des le lancement, pour que le coffre et la
  base restent accessibles de facon stable d'une mise a jour a l'autre. Sur une machine
  issue d'une version anterieure, le profil local est recree une fois (reconfigurer les
  comptes ; restaurer une sauvegarde pour retrouver le coffre).

## [0.1.0] - 2026-06-03

### Ajoute

- Premiere version d'Omnidesk : inbox unifiee avec comptes IMAP/SMTP natifs, et Slack /
  Microsoft Teams en mode web.
- Mises a jour automatiques (electron-updater) : indicateur pres de la cloche quand une
  version est prete, et redemarrage en un clic pour l'installer.
- Modal "Nouveautes" affichee une seule fois apres chaque mise a jour.
- Omnichat : appels audio / video / partage d'ecran (LiveKit) attaches a une conversation.
- omniPass : coffre de mots de passe chiffre (zero-knowledge) avec generateur et autofill.

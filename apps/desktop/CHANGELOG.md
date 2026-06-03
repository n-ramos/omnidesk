# Changelog

Toutes les modifications notables d'Omnidesk sont consignees ici. Le format suit
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le versionnage respecte
[SemVer](https://semver.org/lang/fr/).

A chaque release, ajouter une section `## [x.y.z] - AAAA-MM-JJ` en tete (sous-titres
`### Ajoute` / `### Modifie` / `### Corrige`). La modal "Nouveautes", affichee une seule
fois apres une mise a jour, reprend les sections plus recentes que la version precedente.

## [0.1.0] - 2026-06-03

### Ajoute

- Premiere version d'Omnidesk : inbox unifiee avec comptes IMAP/SMTP natifs, et Slack /
  Microsoft Teams en mode web.
- Mises a jour automatiques (electron-updater) : indicateur pres de la cloche quand une
  version est prete, et redemarrage en un clic pour l'installer.
- Modal "Nouveautes" affichee une seule fois apres chaque mise a jour.
- Omnichat : appels audio / video / partage d'ecran (LiveKit) attaches a une conversation.
- omniPass : coffre de mots de passe chiffre (zero-knowledge) avec generateur et autofill.

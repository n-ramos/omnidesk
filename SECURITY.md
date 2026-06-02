# Securite

## Protection des donnees

| Donnee | Protection |
|---|---|
| Mots de passe IMAP | Chiffres via **Electron safeStorage** (cle maitre dans le trousseau de l'OS), stockes dans la base locale (table `account_secrets`). |
| Contenu local (emails, messages, historique) | Base SQLite (**libsql**) **chiffree au repos** -- tout le fichier. La cle de chiffrement est elle-meme protegee par **safeStorage** (trousseau de l'OS). |
| Integrite de l'application | Build **signe (Developer ID) + notarise + hardened runtime** ; mises a jour livrees par **electron-updater** (signature verifiee). |

### Chiffrement au repos

La base locale (libsql) est chiffree : tout le fichier est protege par une cle aleatoire, elle-meme chiffree via safeStorage (trousseau de l'OS). Sans la session de l'utilisateur, la base est illisible. En **defense en profondeur**, Omnidesk recommande aussi FileVault (chiffrement disque macOS) et previent au demarrage s'il est desactive (*Reglages Systeme > Confidentialite et securite > FileVault*).

## Signaler une vulnerabilite

Merci de signaler toute faille de securite en prive a l'equipe (REMPLACER : security@votre-domaine).
Ne pas ouvrir d'issue publique pour une vulnerabilite non corrigee.

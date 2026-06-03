# Omnidesk

Omnidesk is a local-first desktop application foundation for a unified inbox across
Teams, Slack, and IMAP/SMTP accounts.

The current scaffold is intentionally provider-ready rather than provider-complete:
the app boots, owns a secure Electron boundary, initializes SQLite, exposes typed IPC,
and renders a premium dark-first shell with empty states.

## Stack

- Electron with context isolation enabled
- TypeScript in strict mode
- Vite via `electron-vite`
- Vue 3 and Pinia
- Tailwind CSS
- SQLite via `better-sqlite3`
- Keychain token storage via `keytar`
- ESLint and Prettier
- pnpm workspaces

## Structure

```text
apps/desktop
  src
    main        Electron main process, database, IPC, providers, sync
    preload     Secure context bridge exposed to the renderer
    renderer    Vue application shell and UI primitives
    shared      Cross-process types, IPC contracts, models, safe errors
```

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm --filter @omnidesk/desktop rebuild:native
pnpm --filter @omnidesk/desktop package
```

Run `rebuild:native` after installing dependencies, changing Electron versions, or
seeing a native module ABI error from `better-sqlite3` or `keytar`.

## Mises a jour automatiques

Omnidesk se met a jour via [`electron-updater`](https://www.electron.build/auto-update).
L'app verifie les MAJ au lancement (puis toutes les 6 h) et telecharge en arriere-plan.
Quand une version est prete, un indicateur apparait a cote de la cloche (une fleche qui
descend) : un clic redemarre l'app pour l'installer. Une notification systeme previent
aussi lorsque la fenetre est masquee.

### Publier une mise a jour

Le workflow [`.github/workflows/release.yml`](.github/workflows/release.yml) s'occupe de
tout sur un tag `v*` : il construit les artefacts par OS et les publie sur la **GitHub
Release** du tag (dmg/zip, exe NSIS, AppImage + les manifestes `latest*.yml` lus par les
clients). La version du tag doit correspondre a celle de `apps/desktop/package.json`.

```bash
# 1. bumper la version dans apps/desktop/package.json (ex. "version": "0.2.0")
# 2. commit, tag identique, push
git commit -am "release: v0.2.0"
git tag v0.2.0
git push origin main --tags
```

> Le depot doit etre **public** pour qu'electron-updater lise les releases sans jeton.
> La signature/notarisation macOS exige les secrets `CSC_LINK`, `CSC_KEY_PASSWORD`,
> `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` et `APPLE_TEAM_ID` (voir l'en-tete du workflow).

Pour relire une release avant diffusion, passer `releaseType` de `release` a `draft` dans
`build.publish` (`apps/desktop/package.json`) et publier la release manuellement.

## Security Baseline

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- Renderer talks only through `window.omnidesk`
- IPC payloads are validated with Zod
- Provider tokens never cross into the renderer
- External navigation is denied inside the app window and opened externally

## Database

SQLite is initialized under Electron's `userData` directory with WAL enabled. The
schema includes:

- `providers`
- `accounts`
- `conversations`
- `conversation_participants`
- `messages`
- `attachments`
- `sync_cursors`
- `notifications`
- `local_message_states`

All domain rows use UUID-compatible text primary keys.

## Provider Architecture

Providers implement `CommunicationProvider` and are registered in the main process.

- IMAP/SMTP (real)
- Slack et Teams en mode web (webview persistante, comptes "webpage")

The abstraction is ready for authentication, conversation sync, message sync, send,
attachments, notifications, and cursor persistence.

## Configurer IMAP / SMTP

L'integration IMAP/SMTP est native : aucune cle .env, tout est par compte.
Vous pouvez ajouter plusieurs comptes mail (un par adresse).

1. Dans Omnidesk, **Ajouter un compte** -> **IMAP / SMTP**.
2. Saisissez votre adresse mail et votre mot de passe (ou mot de passe
   d'application si votre fournisseur le demande, comme Gmail ou iCloud).
3. Omnidesk detecte automatiquement les serveurs en combinant :
   - la base Mozilla autoconfig hebergee par Thunderbird,
   - les fichiers autoconfig publies par votre fournisseur,
   - les enregistrements DNS SRV `_imaps._tcp` / `_submissions._tcp`
     (RFC 6186), avec un repli sur les MX du domaine.
4. Verifiez/ajustez les serveurs IMAP et SMTP proposes, puis **Connecter**.
5. Omnidesk teste la connexion (IMAP + SMTP) avant de persister le compte.
   Le mot de passe est stocke dans le trousseau systeme via `keytar`.

Les fils de discussion sont reconstitues a partir des entetes `Message-ID`,
`In-Reply-To` et `References`. Les reponses reutilisent automatiquement le
sujet, la chaine `References` et les destinataires de la conversation.

## Environment

Copy `apps/desktop/.env.example` when real credentials are introduced:

```bash
cp apps/desktop/.env.example apps/desktop/.env
```

## OmniProxy (omnichat / LiveKit)

L'**omnichat** (appels audio/video, cf. plus bas) delègue ses secrets a un backend léger,
**OmniProxy** (depot separe : [github.com/n-ramos/omniproxy](https://github.com/n-ramos/omniproxy)), pour ne JAMAIS embarquer de cle dans l'app de
bureau : OmniProxy mint les jetons LiveKit et pilote l'enregistrement. Sans OmniProxy
configure, l'omnichat est simplement desactive.

### Mise en route

```bash
git clone https://github.com/n-ramos/omniproxy.git ../OmniProxy
cd ../OmniProxy
pnpm install
cp .env.example .env        # renseigner OMNIPROXY_API_KEY, LIVEKIT_*, S3_* ...
docker compose up -d         # LiveKit + redis + egress + MinIO (necessaire pour l'omnichat)
pnpm dev                     # http://127.0.0.1:8787 ; curl .../health pour verifier
```

Puis cote Omnidesk, dans `apps/desktop/.env` :

```bash
OMNIDESK_PROXY_URL=http://127.0.0.1:8787
OMNIDESK_PROXY_API_KEY=<identique a OMNIPROXY_API_KEY>
```

Voir le [README d'OmniProxy](https://github.com/n-ramos/omniproxy) pour le detail (endpoints, securite, infra LiveKit).

## Slack / Teams (mode web)

Slack et Teams ne sont plus des integrations OAuth : ils s'utilisent en **mode web**.
Dans **Ajouter un compte**, les raccourcis Slack et Teams creent un compte de type
`webpage` preconfigure (cf. `apps/desktop/src/shared/webServices.ts`) :

- Slack -> `https://app.slack.com/client`
- Microsoft Teams -> `https://teams.microsoft.com`

Chaque service s'ouvre dans une webview persistante a la session isolee par compte ;
l'authentification se fait directement dans la page, comme dans un navigateur. Aucun
secret, jeton ni cle d'API a configurer cote app.

## Omnichat (appels audio / video)

Omnichat ajoute des appels temps reel (audio, video, partage d'ecran et
enregistrement) attaches a une conversation, via [LiveKit](https://livekit.io/).
Les jetons LiveKit sont mintes par **OmniProxy** (voir plus haut) ; l'app n'embarque
aucune cle LiveKit.

**Prerequis** : OmniProxy demarre (`pnpm dev`) avec l'infra LiveKit lancee
(`docker compose up -d`), et `OMNIDESK_PROXY_URL` defini cote desktop.

Utilisation :

1. Ouvrez une conversation puis cliquez l'icone **telephone** dans l'en-tete.
2. macOS demande l'autorisation micro/camera au premier usage (l'app les declare
   dans son Info.plist et ses entitlements). Le partage d'ecran demande
   l'autorisation **Enregistrement de l'ecran** du systeme.
3. Dans l'overlay d'appel : couper le micro, activer la camera, partager l'ecran,
   **enregistrer** (l'egress depose un MP4 dans le bucket MinIO `recordings`), ou
   raccrocher. **Reduire** garde l'appel actif en arriere-plan.

Securite : le micro, la camera et la capture d'ecran ne sont accordes qu'au
renderer de l'app ; les pages web embarquees (OmniBrowser) n'y ont jamais acces.

> **CSP** : la connexion de signalisation LiveKit utilise `ws://localhost:*`, deja
> autorise par la CSP du renderer (`apps/desktop/src/renderer/index.html`). Si vous
> pointez `LIVEKIT_PUBLIC_URL` ailleurs que sur localhost, ajoutez l'origine `wss://`
> correspondante au `connect-src`.

> **Portee V1** : une room LiveKit par conversation (on rejoint la meme room en
> ouvrant l'appel depuis la meme conversation). La sonnerie / notification d'appel
> entrant entre utilisateurs necessite une couche de signalisation (WebSocket sur
> OmniProxy) et constitue l'etape suivante.

# Contrat d'API -- Provider GitHub (app desktop <-> OmniProxy)

Statut : PROPOSITION (a valider). Concerne deux depots : `omnidesk` (PUBLIC, app
desktop) et `omniproxy` (PRIVE, backend). Convention d'ecriture : francais SANS
diacritiques + apostrophes ASCII, comme tout le code du repo.

## 1. Principe

- Integration via une **OAuth App GitHub**. Le `client_secret` vit UNIQUEMENT sur
  OmniProxy (depot prive). Le DMG ne contient aucun secret GitHub.
- Le token GitHub de l'utilisateur **ne quitte jamais le proxy** : l'app ne recoit
  que des donnees normalisees. Meme modele que LiveKit (le proxy est l'autorite qui
  detient les cles ; le renderer ne le voit jamais, tout passe par IPC -> main).
- Le lien GitHub est rattache au **compte OmniProxy** (userId du JWT), pas a la
  machine -> multi-appareils et revocation centralisee gratuits.

```
  App (main)                     OmniProxy (detient client_secret)            GitHub
     | POST /github/oauth/start  (Bearer JWT compte)                             |
     | --------------------------> genere un state signe (porte le userId)       |
     | shell.openExternal(authorizeUrl) -- navigateur SYSTEME ----------------->| user autorise
     |                            GET /github/oauth/callback?code&state  <--------| redirect (PUBLIC)
     |                                echange code+secret -> token, chiffre+stocke|
     |                                lie au userId du state ; 302 omnidesk://... |
     | <-- omnidesk://github/connected?status=ok  (refocus, AUCUN secret)        |
     | GET /github/pull-requests (Bearer JWT) -----> resout le token du userId,  |
     | <-- GithubPullRequest[] (normalise) <-------- appelle l'API GitHub        |
```

## 2. Configuration de l'OAuth App sur GitHub (prerequis, a faire une fois, par toi)

Tout se passe sur github.com, cote proprietaire de l'app (toi). AUCUNE de ces valeurs
ne va dans le DMG : seul le proxy les recoit (cf. section 10).

### 2.1 Creer l'OAuth App
1. GitHub -> avatar -> **Settings** -> **Developer settings** -> **OAuth Apps** ->
   **New OAuth App**. (Pour une organisation : Org -> Settings -> Developer settings.)
2. Remplir :
   - **Application name** : `Omnidesk` (visible par l'utilisateur sur l'ecran de
     consentement).
   - **Homepage URL** : l'URL de ton choix, ex. `https://omnidesk.app`.
   - **Application description** : courte phrase (affichee a l'utilisateur).
   - **Authorization callback URL** : `https://<host-proxy>/github/oauth/callback`,
     EXACTEMENT egale a `GITHUB_OAUTH_CALLBACK_URL` (section 10). Point le plus critique :
     le moindre ecart (slash final, http vs https, host) fait echouer l'echange.
   - **Enable Device Flow** : laisser **DECOCHE** (on utilise le web flow via le proxy).
3. **Register application**.

### 2.2 Recuperer les identifiants
- **Client ID** : public -> renseigne `GITHUB_CLIENT_ID` cote proxy.
- **Generate a new client secret** -> a copier IMMEDIATEMENT (affiche une seule fois)
  -> renseigne `GITHUB_CLIENT_SECRET` cote proxy. SECRET : jamais committe, jamais cote
  app/DMG. Le regenerer invalide l'ancien.
- (Optionnel) Uploader un logo carre pour soigner l'ecran de consentement.

### 2.3 Callback URL : la regle GitHub a connaitre
- Une OAuth App accepte **une seule** callback URL (GitHub tolere des sous-chemins du
  meme host, mais pas un autre host).
- Donc pour **DEV vs PROD** (hosts differents : `localhost`/tunnel vs proxy public),
  cree **deux OAuth Apps distinctes** -- p. ex. `Omnidesk (dev)` et `Omnidesk` -- chacune
  avec sa callback et son couple client_id/secret. Le proxy choisit le bon couple selon
  l'environnement. (Une GitHub App, elle, accepte plusieurs callback URLs ; pas une OAuth App.)

### 2.4 Scopes -- specificite OAuth App (rien a regler sur le portail)
- Contrairement a une GitHub App, une OAuth App **ne declare PAS** ses permissions a la
  creation. Les scopes sont demandes au moment de l'autorisation, via le parametre
  `scope` que le PROXY ajoute a l'authorizeUrl (valeur = `GITHUB_OAUTH_SCOPES`). Tu n'as
  donc rien a cocher ici : tu choisis juste la liste, modifiable sans retoucher l'app GitHub.
- Pour ton besoin (voir TES PR / reviews / depots / Actions) :

  | Scope | Donne acces a | Verdict |
  |---|---|---|
  | `read:user` | profil (login, avatar) | requis (affichage du compte connecte) |
  | `repo` | depots PRIVES + leurs PR / issues / Actions | requis SI tu veux tes depots prives |
  | `public_repo` | depots PUBLICS uniquement | alternative a `repo` si le public suffit |
  | `read:org` | appartenance aux orgs + PR/reviews dans leurs depots | recommande |

- `repo` est **large** (lecture ET ecriture sur les depots prives) : c'est la seule
  option cote OAuth App pour LIRE des depots prives (pas de scope lecture-seule fin).
  A annoncer clairement a l'utilisateur. Si seul le public te suffit, reste sur
  `public_repo` (bien plus rassurant cote consentement).
- Les Actions (workflow runs) sont couvertes par `repo` / `public_repo` -- pas de scope
  dedie.
- Defaut propose pour `GITHUB_OAUTH_SCOPES` : `read:user repo read:org`.

### 2.5 Ce que verra l'utilisateur
GitHub affiche un ecran "Omnidesk by <toi> wants to access your account" listant les
scopes demandes. Apres autorisation -> redirection vers ta callback (proxy). Affiche
une seule fois (re-demande seulement si tu **elargis** les scopes plus tard).

### 2.6 Verification, quota, revocation
- Une OAuth App fonctionne **sans "verification" GitHub** pour un usage perso/equipe.
- Rate limit : ~5000 requetes/h par utilisateur authentifie (gere cote proxy + cache).
- L'utilisateur peut revoquer a tout moment dans GitHub -> Settings -> Applications ;
  ton bouton "Deconnecter" (`POST /github/disconnect`) fait l'equivalent cote serveur.

> Alternative non retenue : une **GitHub App** (permissions fines, plusieurs callbacks,
> mais acces limite aux depots ou elle est *installee* et etape d'installation en plus).
> Moins adaptee a un tableau de bord "tout voir". Voir section 11.

## 3. Transport et conventions communes

- **Base URL** : `OMNIDESK_PROXY_URL` (deja bake au build, cote app).
- **Auth** (sauf callback) : en-tete `Authorization: Bearer <accessToken JWT du compte>`.
  Le proxy valide le JWT et en derive `userId` + `email`. Meme JWT que `/auth/me` et
  `/livekit/*`.
- **Rejeu/refresh** : deja cable cote app. Le proxy doit simplement :
  - `401` quand le JWT est invalide/expire (l'app fait `/auth/refresh` puis rejoue 1x).
  - `403 { "error": "EMAIL_NOT_VERIFIED" }` si l'email du compte n'est pas verifie
    (meme contrat que LiveKit, cf. `omniProxyClient.postLivekit`).
- **Succes** : `200` (ou `201`) + corps JSON = le DTO documente.
- **Erreur** : corps JSON `{ "error": string, "message"?: string, "details"?: object }`
  (= `JsonError` de `httpJson.ts`). L'app mappe `error` -> `AppError` (section 7).
- **Routes** : prefixe `/github/*`, toutes PROTEGEES sauf `/github/oauth/callback`
  (PUBLIC : appelee par GitHub, sans JWT -> l'identite vient du `state`, cf. section 8).

## 4. Endpoints -- cycle de vie du lien OAuth

### POST /github/oauth/start  (protege)
Demarre le flux. Le proxy genere un `state` signe (porte le userId, usage unique,
TTL court) et construit l'URL d'autorisation GitHub.

- Requete : `{ "scopes"?: string[] }` (optionnel ; defaut = `GITHUB_OAUTH_SCOPES`).
- Reponse `200` : `{ "authorizeUrl": string }`
  (le `state` reste cote serveur, l'app n'a pas a le connaitre).
- L'app ouvre `authorizeUrl` via `shell.openExternal` (navigateur systeme, jamais une
  BrowserWindow embarquee).

### GET /github/oauth/callback?code=...&state=...  (PUBLIC)
Appelee par GitHub dans le navigateur. Le proxy :
1. valide le `state` (signature + non expire + non rejoue) et en extrait le userId ;
2. echange `code` + `client_secret` contre le token GitHub ;
3. lit le profil (`login`, `avatarUrl`, scopes accordes) ;
4. chiffre et stocke le token, le refresh token eventuel et les expirations, lies au userId ;
5. repond `302 Location: omnidesk://github/connected?status=ok`
   (ou `...?status=error&reason=<code>`), avec une page HTML de repli
   ("Vous pouvez revenir dans Omnidesk / fermer cet onglet").

L'app ne lit AUCUN parametre sensible de ce retour : `omnidesk://` sert seulement a
ramener la fenetre au premier plan, puis l'app emet `github:link` au renderer, qui
appelle `GET /github/status` puis `GET /github/summary`.

### GET /github/status  (protege)
- Reponse `200` : `GithubStatus` (section 6). `connected:false` si aucun lien.

### POST /github/disconnect  (protege)
Revoque le grant cote GitHub (`DELETE /applications/{client_id}/grant`) puis purge le
lien local.
- Reponse `200` : `{ "ok": true }`

## 5. Endpoints -- donnees (passerelle, lecture)

Tous proteges. Le proxy resout le token du userId, appelle l'API GitHub, normalise.
`limit` : defaut 30, max 100. Tri implicite : plus recent d'abord.

| Methode + route | Query | Reponse |
|---|---|---|
| `GET /github/pull-requests` | `role=author` (defaut) \| `assigned`, `limit` | `GithubPullRequest[]` |
| `GET /github/review-requests` | `limit` | `GithubPullRequest[]` (PR ou une review m'est demandee) |
| `GET /github/repos` | `affiliation=owner,collaborator,organization_member`, `sort=pushed` (defaut), `limit` | `GithubRepo[]` |
| `GET /github/workflow-runs` | `filter=active` (defaut : queued+in_progress) \| `recent`, `limit` | `GithubWorkflowRun[]` |
| `GET /github/summary` | `limit` | `GithubSummary` (agrege les 4 ci-dessus en 1 appel) |

Notes d'implementation cote proxy (informatif, non contractuel) :
- PR + review-requests : `GET /search/issues` (`is:pr is:open author:<login>` /
  `review-requested:<login>`) ou, mieux, **GraphQL** (`reviewDecision`, rollup des
  checks et le tout en une requete).
- repos : `GET /user/repos?sort=pushed`.
- workflow-runs : il n'existe PAS d'endpoint "tous mes runs". Strategie : prendre les
  N repos les plus recemment pousses puis agreger `GET /repos/{o}/{r}/actions/runs`.
  -> **Couverture non exhaustive** : a documenter cote UI ("Actions des depots
  recents"), ne pas laisser croire que c'est exhaustif (pas de troncature silencieuse).
- `GET /github/summary` est recommande pour le tableau de bord : 1 aller-retour, 1
  point de cache, 1 mapping d'erreur.

## 6. DTO partages

A placer dans `apps/desktop/src/shared/github.ts`. Le proxy renvoie EXACTEMENT cette
forme (camelCase, `ISODateString`), comme `models.ts`. But : decoupler l'app du format
brut de l'API GitHub.

```ts
import type { ISODateString } from './models'

export interface GithubStatus {
  connected: boolean
  login?: string // handle GitHub, ex. 'octocat'
  name?: string
  avatarUrl?: string
  scopes?: string[] // scopes OAuth reellement accordes
  connectedAt?: ISODateString
}

export interface GithubRepoRef {
  owner: string
  name: string
  fullName: string // 'owner/name'
}

export type GithubReviewDecision = 'approved' | 'changes_requested' | 'review_required' | null
export type GithubChecksRollup = 'success' | 'failure' | 'pending' | 'neutral' | null

export interface GithubPullRequest {
  id: number
  number: number
  title: string
  url: string // html_url
  repo: GithubRepoRef
  state: 'open' | 'closed' | 'merged'
  isDraft: boolean
  authorLogin: string
  authorAvatarUrl?: string
  createdAt: ISODateString
  updatedAt: ISODateString
  reviewDecision?: GithubReviewDecision
  checks?: GithubChecksRollup
  commentsCount?: number
  additions?: number
  deletions?: number
  labels?: Array<{ name: string; color?: string }>
}

export interface GithubRepo {
  id: number
  name: string
  fullName: string
  owner: string
  url: string
  isPrivate: boolean
  description?: string
  language?: string
  stars: number
  forks: number
  openIssues: number
  defaultBranch: string
  pushedAt?: ISODateString
  updatedAt?: ISODateString
}

export type GithubRunStatus =
  | 'queued' | 'in_progress' | 'completed' | 'waiting' | 'requested' | 'pending'
export type GithubRunConclusion =
  | 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out'
  | 'action_required' | 'neutral' | 'stale' | null

export interface GithubWorkflowRun {
  id: number
  name: string // nom du workflow
  repo: GithubRepoRef
  status: GithubRunStatus
  conclusion: GithubRunConclusion
  branch: string // head_branch
  event: string // push, pull_request, schedule...
  url: string // html_url
  runNumber: number
  actorLogin?: string
  createdAt: ISODateString
  updatedAt: ISODateString
}

export interface GithubSummary {
  status: GithubStatus
  authoredPrs: GithubPullRequest[]
  reviewRequests: GithubPullRequest[]
  repos: GithubRepo[]
  workflowRuns: GithubWorkflowRun[]
  fetchedAt: ISODateString
}
```

## 7. Erreurs : codes proxy -> AppError

Nouveaux `AppErrorCode` a ajouter dans `apps/desktop/src/shared/errors.ts` :

```ts
  // --- Provider GitHub ---
  | 'GITHUB_NOT_LINKED'   // aucun compte GitHub lie -> proposer "Connecter GitHub"
  | 'GITHUB_AUTH_FAILED'  // token GitHub revoque/expire -> proposer de reconnecter
  | 'GITHUB_FORBIDDEN'    // scope insuffisant pour l'action demandee
  | 'GITHUB_RATE_LIMITED' // quota GitHub atteint (details.resetAt)
```

Reutiliser tels quels : `OAUTH_FAILED` (echec d'echange du code), `PROVIDER_UNAVAILABLE`
(GitHub injoignable), `ACCOUNT_NOT_AUTHENTICATED` / `ACCOUNT_AUTH_FAILED` /
`ACCOUNT_EMAIL_NOT_VERIFIED` (deja geres comme pour LiveKit), `VALIDATION_FAILED`.

Table de mapping (cote app, dans `githubService`) :

| HTTP | `error` (proxy) | AppError | details |
|---|---|---|---|
| 401 | (JWT compte) | rejeu via refresh ; si persiste -> `ACCOUNT_AUTH_FAILED` | |
| 403 | `EMAIL_NOT_VERIFIED` | `ACCOUNT_EMAIL_NOT_VERIFIED` | |
| 409 | `GITHUB_NOT_LINKED` | `GITHUB_NOT_LINKED` | |
| 401/403 | `GITHUB_TOKEN_INVALID` | `GITHUB_AUTH_FAILED` | |
| 403 | `GITHUB_INSUFFICIENT_SCOPE` | `GITHUB_FORBIDDEN` | `{ requiredScopes }` |
| 429 | `GITHUB_RATE_LIMITED` | `GITHUB_RATE_LIMITED` | `{ resetAt }` |
| 400 | `VALIDATION_FAILED` | `VALIDATION_FAILED` | |
| 502/503 | `GITHUB_UNAVAILABLE` | `PROVIDER_UNAVAILABLE` | |

## 8. Securite (regles non negociables)

- `client_secret` GitHub : UNIQUEMENT cote proxy. Jamais dans le DMG ni le depot public.
- Token GitHub : chiffre au repos cote proxy, JAMAIS journalise, JAMAIS renvoye a l'app
  (meme pas dans une reponse d'erreur), JAMAIS expose au renderer.
- **`state` = pivot de securite** (le callback est PUBLIC, sans JWT) : aleatoire >= 128
  bits OU HMAC signe, il PORTE le userId, usage unique, TTL <= 10 min. C'est lui (et lui
  seul) qui prouve a quel compte rattacher le token -> il doit etre infalsifiable. Un
  state invalide/expire/rejoue => refus de l'echange.
- Scopes minimaux et annonces a l'utilisateur (cf. 2.4). Attention : cote OAuth App,
  GitHub n'a pas de scope "lecture seule" fin -- `repo` (prives) est large. Si le public
  suffit, preferer `public_repo`.
- Navigateur SYSTEME (`shell.openExternal`), jamais une webview embarquee.
- Revocation effective sur `/github/disconnect` (cote GitHub + purge locale).
- Quota : cache court cote proxy (ETag / `If-None-Match`, ~60 s) pour ne pas bruler le
  rate-limit GitHub sur les rafraichissements du tableau de bord.
- CSP renderer : inchangee -- tout part du proxy/main, jamais du renderer.

## 9. A cabler cote app (resume ; detaille dans le plan desktop)

- `shared/models.ts` : ajouter `'github'` a `ProviderKind`.
- `shared/github.ts` : DTO de la section 6.
- `shared/errors.ts` : codes de la section 7.
- `shared/ipc.ts` : canaux `github:*` + entrees `IpcRequestMap` / `IpcResponseMap` :
  - `GITHUB_GET_STATUS` (`github:get-status`) -> `GithubStatus`
  - `GITHUB_CONNECT` (`github:connect`) -> `{ ok: true }` (ouvre le navigateur)
  - `GITHUB_DISCONNECT` (`github:disconnect`) -> `{ ok: true }`
  - `GITHUB_GET_SUMMARY` (`github:get-summary`) -> `GithubSummary`
  - (optionnel) un canal par liste si besoin de rafraichir finement.
  - event `PRELOAD_EVENTS.GITHUB_LINK` (`github:link`) pousse au renderer apres
    retour OAuth (sur reception du deep link), sans secret ni token.
- `omniProxyClient` : factoriser un `authedGet/authedPost` generique (en-tete Bearer +
  refresh proactif + rejeu 401), sur le modele de `postLivekit` -- reutilise
  `accountAuthService.ensureFreshAccessToken()` / `refreshNow()`. GitHub en herite.
- `main/github/githubService.ts` : appelle `/github/*` et mappe les erreurs (section 7).
- `main/index.ts` : router `omnidesk://github/connected` via `open-url` macOS et
  `second-instance` -> refocus + emettre `github:link`; rejouer l'evenement si le
  renderer n'est pas encore pret.
- UI renderer : panneau GitHub (widgets PR / reviews / depots / Actions), derriere le
  meme gate "compte requis" que la messagerie et les appels.

## 10. Variables d'environnement (cote proxy uniquement)

Renseignees a partir des valeurs obtenues en 2.1-2.2.

| Variable | Role |
|---|---|
| `GITHUB_CLIENT_ID` | Identifiant de l'OAuth App (public). |
| `GITHUB_CLIENT_SECRET` | Secret de l'OAuth App. SECRET serveur. |
| `GITHUB_OAUTH_CALLBACK_URL` | `{urlPubliqueProxy}/github/oauth/callback` ; doit correspondre EXACTEMENT a la callback de l'OAuth App (2.1). |
| `GITHUB_OAUTH_SCOPES` | Scopes par defaut, ex. `read:user repo read:org` (2.4). |
| `GITHUB_RETURN_URL` | Deep link de retour, defaut `omnidesk://github/connected`. |

Schema de stockage suggere (cote proxy) :

```sql
CREATE TABLE github_links (
  user_id TEXT PRIMARY KEY,
  github_user_id TEXT NOT NULL,
  login TEXT NOT NULL,
  avatar_url TEXT,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  access_token_expires_at TEXT,
  refresh_token_expires_at TEXT,
  scopes_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_github_links_github_user_id ON github_links(github_user_id);
```

Si la configuration GitHub renvoie des tokens expirables (`expires_in`,
`refresh_token`, `refresh_token_expires_in`), le proxy doit rafraichir proactivement
l'access token avant les appels API GitHub (par exemple a moins de 5 min de
l'expiration), persister le nouveau couple chiffre, puis rejouer l'appel une fois.
Si aucun refresh token n'est fourni, `refresh_token_enc` et les expirations restent
NULL et le token est traite comme non expirant jusqu'a revocation.

## 11. Hors perimetre (v1)

- Ecriture (merge, approve/request-changes, re-run d'un workflow) : a ajouter plus tard
  via des routes `POST /github/*` dediees + scopes en consequence.
- Webhooks GitHub (push temps reel) : necessitent un secret de webhook (cote proxy) ;
  non requis pour un tableau de bord en lecture avec rafraichissement periodique.
- Bascule vers une **GitHub App** (permissions granulaires, installation par depot, gros
  rate limit) : possible plus tard ; impacte surtout le proxy (JWT signe par cle privee
  pour les installation tokens). Le contrat app <-> proxy ci-dessus resterait quasi identique.

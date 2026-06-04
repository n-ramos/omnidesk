// Types partages (main / preload / renderer) du provider GitHub. Le token GitHub ne
// quitte JAMAIS le proxy : l'app ne manipule que ces DTO normalises (camelCase,
// ISODateString) renvoyes par OmniProxy. Cf. docs/github-provider-contract.md.
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
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'waiting'
  | 'requested'
  | 'pending'
export type GithubRunConclusion =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'skipped'
  | 'timed_out'
  | 'action_required'
  | 'neutral'
  | 'stale'
  | null

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

// Agregat du tableau de bord : un seul aller-retour proxy (GET /github/summary).
export interface GithubSummary {
  status: GithubStatus
  authoredPrs: GithubPullRequest[]
  reviewRequests: GithubPullRequest[]
  repos: GithubRepo[]
  workflowRuns: GithubWorkflowRun[]
  fetchedAt: ISODateString
}

// Retour du flux OAuth, pousse main -> renderer a la reception du deep link
// omnidesk://github/connected?status=ok|error. Pur signal (aucun secret) : le renderer
// re-interroge github.getStatus()/getSummary() a la reception.
export interface GithubLinkEvent {
  status: 'ok' | 'error'
  reason?: string
}

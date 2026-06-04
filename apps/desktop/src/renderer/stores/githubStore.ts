import { defineStore } from 'pinia'
import { errorMessage } from '@shared/errors'
import type {
  GithubPullRequest,
  GithubRepo,
  GithubStatus,
  GithubWorkflowRun,
} from '@shared/github'

// Disposer de l'abonnement push (module-level, comme les autres stores).
let stopGithubLink: (() => void) | undefined

const api = () => window.omnidesk

interface GithubStoreState {
  status: GithubStatus | null
  authoredPrs: GithubPullRequest[]
  reviewRequests: GithubPullRequest[]
  repos: GithubRepo[]
  workflowRuns: GithubWorkflowRun[]
  fetchedAt: string | null
  initialized: boolean
  loading: boolean
  connecting: boolean
  error?: string
}

// Tableau de bord GitHub : tout passe par OmniProxy (le token GitHub reste cote main, jamais
// expose ici). On lit le statut du lien puis, si lie, l'agregat (PR, reviews, depots, runs).
// Le retour du flux OAuth arrive via l'evenement push github:link (deep link).
export const useGithubStore = defineStore('github', {
  state: (): GithubStoreState => ({
    status: null,
    authoredPrs: [],
    reviewRequests: [],
    repos: [],
    workflowRuns: [],
    fetchedAt: null,
    initialized: false,
    loading: false,
    connecting: false,
  }),

  getters: {
    connected: (state): boolean => state.status?.connected === true,
  },

  actions: {
    reset(): void {
      this.status = null
      this.authoredPrs = []
      this.reviewRequests = []
      this.repos = []
      this.workflowRuns = []
      this.fetchedAt = null
      this.error = undefined
      this.connecting = false
      this.loading = false
    },

    async init(): Promise<void> {
      if (this.initialized) {
        await this.refreshStatus()
        if (this.connected) {
          await this.refresh()
        }
        return
      }
      const a = api()
      if (!a?.github?.getStatus) {
        return
      }
      this.initialized = true
      this.subscribe()
      await this.refreshStatus()
      if (this.connected) {
        await this.refresh()
      }
    },

    subscribe(): void {
      const a = api()
      if (!a?.events?.onGithubLink) {
        return
      }
      stopGithubLink?.()
      // Retour du flux OAuth (deep link omnidesk://github/connected). 'error' -> message ;
      // 'ok' -> on relit le statut puis le tableau de bord.
      stopGithubLink = a.events.onGithubLink((event) => {
        if (event.status === 'error') {
          this.error = 'La connexion GitHub a echoue. Reessaie.'
          this.connecting = false
          return
        }
        void this.afterLink()
      })
    },

    async afterLink(): Promise<void> {
      this.connecting = false
      this.error = undefined
      await this.refreshStatus()
      if (this.connected) {
        await this.refresh()
      }
    },

    async refreshStatus(): Promise<void> {
      const a = api()
      if (!a?.github?.getStatus) {
        return
      }
      try {
        this.status = await a.github.getStatus()
      } catch (error) {
        this.error = errorMessage(error, 'Impossible de lire le statut GitHub.')
      }
    },

    async refresh(): Promise<void> {
      const a = api()
      if (!a?.github?.getSummary) {
        return
      }
      this.loading = true
      this.error = undefined
      try {
        const summary = await a.github.getSummary(50)
        this.status = summary.status
        this.authoredPrs = summary.authoredPrs
        this.reviewRequests = summary.reviewRequests
        this.repos = summary.repos
        this.workflowRuns = summary.workflowRuns
        this.fetchedAt = summary.fetchedAt
      } catch (error) {
        this.error = errorMessage(error, 'Impossible de charger les donnees GitHub.')
      } finally {
        this.loading = false
      }
    },

    // Ouvre l'autorisation dans le navigateur systeme (cote main). Le retour se fait via
    // l'evenement github:link -> afterLink(). On ne recoit aucun secret cote renderer.
    async connect(): Promise<void> {
      const a = api()
      if (!a?.github?.connect) {
        return
      }
      this.connecting = true
      this.error = undefined
      try {
        await a.github.connect()
      } catch (error) {
        this.error = errorMessage(error, 'Impossible de demarrer la connexion GitHub.')
        this.connecting = false
      }
    },

    async disconnect(): Promise<void> {
      const a = api()
      if (!a?.github?.disconnect) {
        return
      }
      this.loading = true
      this.error = undefined
      try {
        await a.github.disconnect()
        this.status = { connected: false }
        this.authoredPrs = []
        this.reviewRequests = []
        this.repos = []
        this.workflowRuns = []
        this.fetchedAt = null
      } catch (error) {
        this.error = errorMessage(error, 'Impossible de deconnecter GitHub.')
      } finally {
        this.loading = false
      }
    },
  },
})

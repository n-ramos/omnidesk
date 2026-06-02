import { defineStore } from 'pinia'

export type MascotMessageKind = 'greeting' | 'quote' | 'reminder' | 'nudge' | 'tip'

export interface MascotMessage {
  id: string
  kind: MascotMessageKind
  /** Petit en-tete optionnel (ex: titre du pense-bete). */
  title?: string
  text: string
  /** Auteur, pour les citations. */
  author?: string
  /** Duree d'affichage avant disparition automatique (ms). */
  durationMs: number
}

const STORAGE_ENABLED = 'omnidesk.omnihoowl.enabled'
const STORAGE_MUTED = 'omnidesk.omnihoowl.muted'
const STORAGE_TUCKED = 'omnidesk.omnihoowl.tucked'
const QUEUE_MAX = 3

const readBool = (key: string, fallback: boolean): boolean => {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value === '1'
  } catch {
    return fallback
  }
}

const persist = (key: string, value: boolean): void => {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    // Le stockage local peut etre indisponible : on degrade silencieusement.
  }
}

let counter = 0
export const nextMascotId = (): string => {
  counter += 1
  return `mascot-${Date.now()}-${counter}`
}

interface MascotState {
  enabled: boolean
  muted: boolean
  /** Rangee contre le bord droit : seul un oeil depasse, un clic la fait revenir. */
  tucked: boolean
  message: MascotMessage | null
  queue: MascotMessage[]
}

export const useMascotStore = defineStore('mascot', {
  state: (): MascotState => ({
    enabled: readBool(STORAGE_ENABLED, true),
    muted: readBool(STORAGE_MUTED, false),
    tucked: readBool(STORAGE_TUCKED, false),
    message: null,
    queue: [],
  }),

  getters: {
    /** Vrai quand une bulle est affichee (la chouette "parle"). */
    talking: (state): boolean => state.message !== null,
  },

  actions: {
    setEnabled(value: boolean): void {
      this.enabled = value
      persist(STORAGE_ENABLED, value)
      if (!value) {
        this.message = null
        this.queue = []
      } else {
        // Reapparaitre en grand : on annule un eventuel etat "rangee sur le cote".
        this.setTucked(false)
      }
    },

    /** Range Elodie contre le bord (un oeil depasse) ou la fait revenir au complet. */
    setTucked(value: boolean): void {
      this.tucked = value
      persist(STORAGE_TUCKED, value)
    },

    toggleTucked(): void {
      this.setTucked(!this.tucked)
    },

    /** Coupe ou reactive le son et le bavardage d'Elodie. */
    setMuted(value: boolean): void {
      this.muted = value
      persist(STORAGE_MUTED, value)
      if (value) {
        this.message = null
        this.queue = []
      }
    },

    toggleMuted(): void {
      this.setMuted(!this.muted)
    },

    /**
     * Programme un message. `force` permet aux pense-betes et aux clics directs
     * de passer outre la sourdine et d'interrompre le message courant.
     */
    enqueue(message: MascotMessage, options: { force?: boolean } = {}): void {
      if (!this.enabled) return
      if (!options.force && this.muted) return
      // Un message force (pense-bete, test depuis les reglages) sort Elodie de sa cachette
      // pour qu'il reste visible.
      if (options.force && this.tucked) this.setTucked(false)

      if (this.message === null) {
        this.message = message
        return
      }

      if (options.force) {
        this.queue.unshift(this.message)
        if (this.queue.length > QUEUE_MAX) {
          this.queue = this.queue.slice(0, QUEUE_MAX)
        }
        this.message = message
        return
      }

      if (this.queue.length < QUEUE_MAX) {
        this.queue.push(message)
      }
    },

    /** Passe au message suivant de la file (ou efface la bulle). */
    dismiss(): void {
      this.message = this.queue.shift() ?? null
    },

    clear(): void {
      this.message = null
      this.queue = []
    },
  },
})

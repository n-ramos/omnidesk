import { reactive } from 'vue'

interface CallOverlayState {
  open: boolean
}

// Etat minimal d'ouverture de l'overlay d'appel (meme esprit que useConfirm).
// L'etat de l'appel lui-meme (participants, pistes, micro...) vit dans useOmnichat.
const state = reactive<CallOverlayState>({ open: false })

export const callOverlayState = state

export const openCallOverlay = (): void => {
  state.open = true
}

export const closeCallOverlay = (): void => {
  state.open = false
}

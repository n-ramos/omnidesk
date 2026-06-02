import { reactive } from 'vue'

export type ConfirmTone = 'danger' | 'primary'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
}

interface ConfirmState extends ConfirmOptions {
  open: boolean
  resolve?: (value: boolean) => void
}

const state = reactive<ConfirmState>({
  open: false,
  title: '',
})

export const confirmState = state

export const confirm = (options: ConfirmOptions): Promise<boolean> => {
  state.title = options.title
  state.message = options.message
  state.confirmLabel = options.confirmLabel
  state.cancelLabel = options.cancelLabel
  state.tone = options.tone ?? 'primary'
  state.open = true

  return new Promise<boolean>((resolve) => {
    state.resolve = resolve
  })
}

export const resolveConfirm = (value: boolean): void => {
  state.open = false
  const resolver = state.resolve
  state.resolve = undefined
  resolver?.(value)
}

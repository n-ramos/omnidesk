/// <reference types="vite/client" />

import type { OmnideskApi } from '@preload/api'

declare global {
  interface Window {
    omnidesk?: OmnideskApi
  }
}

declare module 'vue3-emoji-picker' {
  import type { DefineComponent } from 'vue'

  export interface EmojiSelectEvent {
    i: string
    n: string[]
    r: string
    t: string
    u: string
  }

  const EmojiPicker: DefineComponent<
    {
      native?: boolean
      hideSearch?: boolean
      hideGroupNames?: boolean
      hideGroupIcons?: boolean
      disableSkinTones?: boolean
      disableStickyGroupIcons?: boolean
      staticTexts?: Record<string, string>
      theme?: 'light' | 'dark' | 'auto'
      pickerType?: 'input' | 'textarea' | ''
    },
    Record<string, unknown>,
    unknown,
    Record<string, unknown>,
    Record<string, unknown>,
    Record<string, unknown>,
    Record<string, unknown>,
    {
      select: (emoji: EmojiSelectEvent) => void
    }
  >

  export default EmojiPicker
}

declare module 'vue3-emoji-picker/css' {
  const css: string
  export default css
}

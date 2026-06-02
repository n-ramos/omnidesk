import type { UUID } from '@shared/models'

export interface WebpageWebviewElement extends HTMLElement {
  src: string
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>
  insertCSS: (css: string) => Promise<string>
  removeInsertedCSS: (key: string) => Promise<void>
  setAudioMuted: (muted: boolean) => void
  isAudioMuted: () => boolean
  isCurrentlyAudible: () => boolean
  getWebContentsId: () => number
  loadURL: (url: string) => Promise<void>
  stop: () => void
  reload: () => void
  reloadIgnoringCache: () => void
  goBack: () => void
  goForward: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
  getURL: () => string
  getTitle: () => string
}

interface WebpageMediaSnapshot {
  paused: boolean | null
  volume: number | null
  title?: string
  artist?: string
  album?: string
  artworkUrl?: string
}

const READ_MEDIA_SNAPSHOT_JS = `
(() => {
  const media = document.querySelector('video, audio')
  let metadata = null
  try {
    metadata = navigator.mediaSession?.metadata ?? null
  } catch (_err) {
    metadata = null
  }
  return {
    paused: media ? media.paused : null,
    volume: media ? media.volume : null,
    title: metadata?.title || document.title || undefined,
    artist: metadata?.artist || undefined,
    album: metadata?.album || undefined,
    artworkUrl: metadata?.artwork?.[0]?.src || undefined,
  }
})()
`

const TOGGLE_PLAY_PAUSE_JS = `
(() => {
  const media = document.querySelector('video, audio')
  if (!media) return null
  if (media.paused) {
    const promise = media.play()
    if (promise && typeof promise.catch === 'function') {
      promise.catch(() => {})
    }
  } else {
    media.pause()
  }
  return media.paused
})()
`

const setVolumeJs = (volume: number): string => `
(() => {
  document.querySelectorAll('video, audio').forEach((media) => {
    try {
      media.volume = ${volume.toFixed(4)}
    } catch (_err) {}
  })
  return ${volume.toFixed(4)}
})()
`

const INSTALL_MEDIA_SESSION_WRAPPER_JS = `
(() => {
  if (window.__omnideskMediaWrapped) return true
  const ms = navigator.mediaSession
  if (!ms || typeof ms.setActionHandler !== 'function') return false
  window.__omnideskMediaWrapped = true
  const handlers = {}
  window.__omnideskMediaHandlers = handlers
  const original = ms.setActionHandler.bind(ms)
  ms.setActionHandler = function (action, handler) {
    if (typeof handler === 'function') {
      handlers[action] = handler
    } else {
      delete handlers[action]
    }
    return original(action, handler)
  }
  window.__omnideskMediaInvoke = function (action) {
    const handler = handlers[action]
    if (typeof handler !== 'function') return false
    try { handler({ action: action }) } catch (_err) {}
    return true
  }
  return true
})()
`

const invokeMediaActionJs = (action: string): string =>
  `(typeof window.__omnideskMediaInvoke === 'function' && window.__omnideskMediaInvoke(${JSON.stringify(action)})) === true`

const READ_FAVICON_JS = `
(() => {
  const links = document.querySelectorAll("link[rel~='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']")
  for (const link of links) {
    if (link && link.href) return link.href
  }
  try {
    return new URL('/favicon.ico', location.href).href
  } catch (_err) {
    return null
  }
})()
`

// Capture les notifications web de la page (Slack/Teams appellent `new Notification(...)`
// quand l'onglet est en arriere-plan). On enveloppe le constructeur ET
// ServiceWorkerRegistration.showNotification pour empiler {title, body} dans une file, tout
// en laissant l'appel d'origine afficher le toast systeme natif (clic/deep-link preserves).
// L'hote draine ensuite la file via DRAIN_NOTIFICATIONS_JS.
const INSTALL_NOTIFICATION_BRIDGE_JS = `
(() => {
  if (window.__omnideskNotifyWrapped) return true
  window.__omnideskNotifyWrapped = true
  const queue = []
  try {
    Object.defineProperty(window, '__omnideskNotifQueue', {
      value: queue,
      writable: false,
      enumerable: false,
      configurable: true,
    })
  } catch (_err) {
    window.__omnideskNotifQueue = queue
  }
  const record = (title, options) => {
    try {
      queue.push({
        title: title == null ? '' : String(title),
        body: options && options.body != null ? String(options.body) : undefined,
      })
      if (queue.length > 50) queue.splice(0, queue.length - 50)
    } catch (_err) {}
  }
  const OriginalNotification = window.Notification
  if (typeof OriginalNotification === 'function') {
    const Wrapped = function (title, options) {
      record(title, options)
      return new OriginalNotification(title, options)
    }
    Wrapped.prototype = OriginalNotification.prototype
    try {
      Object.defineProperty(Wrapped, 'permission', { get: () => OriginalNotification.permission })
    } catch (_err) {}
    Wrapped.requestPermission = function () {
      return OriginalNotification.requestPermission.apply(OriginalNotification, arguments)
    }
    try { Wrapped.maxActions = OriginalNotification.maxActions } catch (_err) {}
    window.Notification = Wrapped
  }
  try {
    const proto = window.ServiceWorkerRegistration && window.ServiceWorkerRegistration.prototype
    if (proto && typeof proto.showNotification === 'function' && !proto.__omnideskWrapped) {
      const originalShow = proto.showNotification
      proto.showNotification = function (title, options) {
        record(title, options)
        return originalShow.apply(this, arguments)
      }
      proto.__omnideskWrapped = true
    }
  } catch (_err) {}
  return true
})()
`

const DRAIN_NOTIFICATIONS_JS = `
(() => {
  const queue = window.__omnideskNotifQueue
  if (!queue || queue.length === 0) return []
  return queue.splice(0, queue.length)
})()
`

interface WebpageNotificationPayload {
  title: string
  body?: string
}

class WebpageController {
  private readonly registry = new Map<UUID, WebpageWebviewElement>()

  register(accountId: UUID, webview: WebpageWebviewElement): void {
    this.registry.set(accountId, webview)
  }

  unregister(accountId: UUID): void {
    this.registry.delete(accountId)
  }

  get(accountId: UUID): WebpageWebviewElement | undefined {
    return this.registry.get(accountId)
  }

  hasWebContents(webContentsId: number): boolean {
    for (const webview of this.registry.values()) {
      try {
        if (webview.getWebContentsId() === webContentsId) {
          return true
        }
      } catch {
        // Le webview peut etre detache, on ignore.
      }
    }
    return false
  }

  loadUrlForWebContents(webContentsId: number, url: string): boolean {
    for (const webview of this.registry.values()) {
      try {
        if (webview.getWebContentsId() === webContentsId) {
          void webview.loadURL(url)
          return true
        }
      } catch {
        // Le webview peut etre detache, on ignore.
      }
    }
    return false
  }

  async readMediaSnapshot(accountId: UUID): Promise<WebpageMediaSnapshot | undefined> {
    const webview = this.registry.get(accountId)
    if (!webview) {
      return undefined
    }
    try {
      const result = await webview.executeJavaScript(READ_MEDIA_SNAPSHOT_JS)
      return result as WebpageMediaSnapshot
    } catch {
      return undefined
    }
  }

  async installMediaSessionWrapper(accountId: UUID): Promise<void> {
    const webview = this.registry.get(accountId)
    if (!webview) {
      return
    }
    try {
      await webview.executeJavaScript(INSTALL_MEDIA_SESSION_WRAPPER_JS)
    } catch {
      // Pas critique, on retombera sur les touches media.
    }
  }

  async installNotificationBridge(accountId: UUID): Promise<void> {
    const webview = this.registry.get(accountId)
    if (!webview) {
      return
    }
    try {
      await webview.executeJavaScript(INSTALL_NOTIFICATION_BRIDGE_JS)
    } catch {
      // Pas critique : on retombe sur la pastille de non-lus deduite du titre.
    }
  }

  async drainNotifications(accountId: UUID): Promise<WebpageNotificationPayload[]> {
    const webview = this.registry.get(accountId)
    if (!webview) {
      return []
    }
    try {
      const result = await webview.executeJavaScript(DRAIN_NOTIFICATIONS_JS)
      return Array.isArray(result) ? (result as WebpageNotificationPayload[]) : []
    } catch {
      return []
    }
  }

  async readFavicon(accountId: UUID): Promise<string | undefined> {
    const webview = this.registry.get(accountId)
    if (!webview) {
      return undefined
    }
    try {
      const result = await webview.executeJavaScript(READ_FAVICON_JS)
      return typeof result === 'string' && result.length > 0 ? result : undefined
    } catch {
      return undefined
    }
  }

  async togglePlayPause(accountId: UUID): Promise<void> {
    const webview = this.registry.get(accountId)
    if (!webview) {
      return
    }
    try {
      await webview.executeJavaScript(TOGGLE_PLAY_PAUSE_JS, true)
    } catch {
      // Si la page n'a pas d'<audio>/<video> exploitable, on tente la touche media globale.
      await this.sendMediaKey(accountId, 'play-pause')
    }
  }

  private async invokeMediaSessionAction(accountId: UUID, action: string): Promise<boolean> {
    const webview = this.registry.get(accountId)
    if (!webview) {
      return false
    }
    try {
      const invoked = await webview.executeJavaScript(invokeMediaActionJs(action), true)
      return invoked === true
    } catch {
      return false
    }
  }

  async setVolume(accountId: UUID, volume: number): Promise<void> {
    const webview = this.registry.get(accountId)
    if (!webview) {
      return
    }
    const clamped = Math.max(0, Math.min(1, volume))
    try {
      await webview.executeJavaScript(setVolumeJs(clamped))
    } catch {
      // Best-effort, la page peut ignorer.
    }
  }

  toggleMute(accountId: UUID, muted: boolean): void {
    const webview = this.registry.get(accountId)
    if (!webview) {
      return
    }
    webview.setAudioMuted(muted)
  }

  async nextTrack(accountId: UUID): Promise<void> {
    if (await this.invokeMediaSessionAction(accountId, 'nexttrack')) {
      return
    }
    await this.sendMediaKey(accountId, 'next')
  }

  async previousTrack(accountId: UUID): Promise<void> {
    if (await this.invokeMediaSessionAction(accountId, 'previoustrack')) {
      return
    }
    await this.sendMediaKey(accountId, 'previous')
  }

  private async sendMediaKey(
    accountId: UUID,
    key: 'play-pause' | 'next' | 'previous' | 'stop',
  ): Promise<void> {
    const webview = this.registry.get(accountId)
    const api = window.omnidesk?.webpage?.sendMediaKey
    if (!webview || !api) {
      return
    }
    try {
      await api(webview.getWebContentsId(), key)
    } catch {
      // Best-effort.
    }
  }
}

export const webpageController = new WebpageController()

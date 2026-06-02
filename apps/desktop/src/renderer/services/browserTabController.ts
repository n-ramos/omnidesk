import type { UUID } from '@shared/models'
import type { WebpageWebviewElement } from '@renderer/services/webpageController'

// Onglet OmniBrowser : on reutilise l'interface webview de webpageController
// (executeJavaScript, loadURL, navigation, audio...) car les capacites sont identiques.
export type BrowserTabWebviewElement = WebpageWebviewElement

// Identifiant capture a la soumission d'un formulaire (mot de passe en clair, jamais journalise).
export interface CapturedCredential {
  username: string
  password: string
}

// Installe un pont qui capture {username, password} a la soumission d'un formulaire de connexion
// (submit natif, Entree dans le champ mot de passe, ou clic sur un bouton). Les valeurs sont
// empilees dans une file que l'hote draine ensuite. L'origine est ajoutee cote hote (il connait l'URL).
const INSTALL_PASSWORD_BRIDGE_JS = `
(() => {
  if (window.__omnideskCredWrapped) return true
  window.__omnideskCredWrapped = true
  const queue = []
  window.__omnideskCredQueue = queue
  const visible = (el) => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  const findUsername = (passwordEl) => {
    const scope = passwordEl.form || document
    const auto = scope.querySelector('input[autocomplete="username"]')
    if (auto && auto.value) return auto.value
    const candidates = Array.from(scope.querySelectorAll('input[type="email"], input[type="text"], input[type="tel"], input:not([type])'))
    let best = ''
    for (const input of candidates) {
      if (input === passwordEl) break
      if (visible(input) && input.value) best = input.value
    }
    if (best) return best
    const email = scope.querySelector('input[type="email"]')
    return email && email.value ? email.value : ''
  }
  const capture = () => {
    try {
      const pwd = Array.from(document.querySelectorAll('input[type="password"]')).find((el) => visible(el) && el.value)
      if (!pwd) return
      const entry = { username: findUsername(pwd), password: pwd.value }
      queue.push(entry)
      if (queue.length > 10) queue.splice(0, queue.length - 10)
      // Repli pour les connexions avec navigation pleine page : la soumission detruit le document
      // (et cette file en memoire) avant que l'hote draine. On depose l'identifiant en
      // sessionStorage (meme origine, meme onglet, efface au prochain drain) afin que la page
      // suivante puisse le recuperer. Pas plus expose que la file deja posee sur window.
      try {
        sessionStorage.setItem('__omnideskCredPending', JSON.stringify({ username: entry.username, password: entry.password, at: Date.now() }))
      } catch (_e) {}
    } catch (_err) {}
  }
  document.addEventListener('submit', capture, true)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.type === 'password') capture()
  }, true)
  document.addEventListener('click', (e) => {
    const el = e.target
    const btn = el && el.closest ? el.closest('button, input[type="submit"], [role="button"]') : null
    if (btn) capture()
  }, true)
  return true
})()
`

const DRAIN_CAPTURED_CREDENTIALS_JS = `
(() => {
  const out = []
  const queue = window.__omnideskCredQueue
  if (queue && queue.length) out.push.apply(out, queue.splice(0, queue.length))
  // Recupere l'identifiant pose par la page precedente avant une navigation pleine page (meme
  // origine). Toujours lu ET efface ici, avec un controle de fraicheur, pour ne jamais reproposer
  // un couple deja traite a chaque rechargement.
  try {
    const raw = sessionStorage.getItem('__omnideskCredPending')
    if (raw) {
      sessionStorage.removeItem('__omnideskCredPending')
      const saved = JSON.parse(raw)
      if (saved && saved.password && typeof saved.at === 'number' && Date.now() - saved.at < 60000) {
        const dup = out.some((e) => e.username === (saved.username || '') && e.password === saved.password)
        if (!dup) out.push({ username: saved.username || '', password: saved.password })
      }
    }
  } catch (_e) {}
  return out
})()
`

// Pre-remplit le formulaire de connexion. Le setter natif + evenements input/change garantissent
// que les frameworks (React/Vue) prennent en compte la valeur (sinon elle est ignoree).
const fillCredentialsJs = (username: string, password: string): string => `
(() => {
  try {
    const setValue = (el, value) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      const desc = Object.getOwnPropertyDescriptor(proto, 'value')
      if (desc && desc.set) desc.set.call(el, value)
      else el.value = value
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    const visible = (el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    const pwd = Array.from(document.querySelectorAll('input[type="password"]')).find(visible)
    if (!pwd) return false
    // Champ deja rempli (saisie utilisateur, ou tentative precedente) : ne pas ecraser.
    if (pwd.value) return true
    const scope = pwd.form || document
    let userEl = scope.querySelector('input[autocomplete="username"]') || scope.querySelector('input[type="email"]')
    if (!userEl) {
      userEl = Array.from(scope.querySelectorAll('input[type="text"], input[type="tel"], input:not([type])')).find(visible) || null
    }
    const username = ${JSON.stringify(username)}
    if (userEl && username && !userEl.value) setValue(userEl, username)
    setValue(pwd, ${JSON.stringify(password)})
    return true
  } catch (_err) {
    return false
  }
})()
`

/**
 * Registre des webviews d'onglets OmniBrowser. Mappe tabId -> element et tient un
 * index inverse webContentsId -> tabId pour router les popups (window.open) emis
 * par le main process vers le bon onglet/espace.
 */
class BrowserTabController {
  private readonly registry = new Map<UUID, BrowserTabWebviewElement>()
  private readonly webContentsToTab = new Map<number, UUID>()

  register(tabId: UUID, webview: BrowserTabWebviewElement): void {
    this.registry.set(tabId, webview)
    try {
      this.webContentsToTab.set(webview.getWebContentsId(), tabId)
    } catch {
      // L'id de webContents n'est pas encore disponible : il sera (re)lie via syncWebContents.
    }
  }

  // A appeler quand l'id de webContents devient disponible (dom-ready), pour fiabiliser
  // l'index inverse meme si getWebContentsId() echouait au montage.
  syncWebContents(tabId: UUID): void {
    const webview = this.registry.get(tabId)
    if (!webview) {
      return
    }
    try {
      this.webContentsToTab.set(webview.getWebContentsId(), tabId)
    } catch {
      // Ignore : reessaiera au prochain evenement.
    }
  }

  unregister(tabId: UUID): void {
    const webview = this.registry.get(tabId)
    if (webview) {
      try {
        this.webContentsToTab.delete(webview.getWebContentsId())
      } catch {
        // Recherche par valeur en repli.
        for (const [contentsId, mappedTabId] of this.webContentsToTab) {
          if (mappedTabId === tabId) {
            this.webContentsToTab.delete(contentsId)
          }
        }
      }
    }
    this.registry.delete(tabId)
  }

  get(tabId: UUID): BrowserTabWebviewElement | undefined {
    return this.registry.get(tabId)
  }

  tabIdForWebContents(webContentsId: number): UUID | undefined {
    return this.webContentsToTab.get(webContentsId)
  }

  async loadURL(tabId: UUID, url: string): Promise<void> {
    const webview = this.registry.get(tabId)
    if (!webview) {
      return
    }
    try {
      await webview.loadURL(url)
    } catch {
      // La page peut refuser (erreur reseau) : l'evenement did-fail-load remontera.
    }
  }

  reload(tabId: UUID): void {
    this.registry.get(tabId)?.reload()
  }

  hardReload(tabId: UUID): void {
    this.registry.get(tabId)?.reloadIgnoringCache()
  }

  stop(tabId: UUID): void {
    this.registry.get(tabId)?.stop()
  }

  goBack(tabId: UUID): void {
    const webview = this.registry.get(tabId)
    if (webview?.canGoBack()) {
      webview.goBack()
    }
  }

  goForward(tabId: UUID): void {
    const webview = this.registry.get(tabId)
    if (webview?.canGoForward()) {
      webview.goForward()
    }
  }

  setAudioMuted(tabId: UUID, muted: boolean): void {
    this.registry.get(tabId)?.setAudioMuted(muted)
  }

  getWebContentsId(tabId: UUID): number | undefined {
    const webview = this.registry.get(tabId)
    if (!webview) {
      return undefined
    }
    try {
      return webview.getWebContentsId()
    } catch {
      return undefined
    }
  }

  // --- Gestionnaire de mots de passe (injection cote page) -----------------

  async installPasswordBridge(tabId: UUID): Promise<void> {
    const webview = this.registry.get(tabId)
    if (!webview) {
      return
    }
    try {
      await webview.executeJavaScript(INSTALL_PASSWORD_BRIDGE_JS)
    } catch {
      // Best-effort : sans le pont, on perd seulement la proposition d'enregistrement.
    }
  }

  async drainCapturedCredentials(tabId: UUID): Promise<CapturedCredential[]> {
    const webview = this.registry.get(tabId)
    if (!webview) {
      return []
    }
    try {
      const result = await webview.executeJavaScript(DRAIN_CAPTURED_CREDENTIALS_JS)
      return Array.isArray(result) ? (result as CapturedCredential[]) : []
    } catch {
      return []
    }
  }

  async fillCredentials(tabId: UUID, username: string, password: string): Promise<boolean> {
    const webview = this.registry.get(tabId)
    if (!webview) {
      return false
    }
    try {
      const filled = await webview.executeJavaScript(fillCredentialsJs(username, password))
      return filled === true
    } catch {
      return false
    }
  }
}

export const browserTabController = new BrowserTabController()

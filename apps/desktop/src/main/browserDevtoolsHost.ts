import { WebContentsView } from 'electron'
import type { BrowserWindow, Rectangle, WebContents } from 'electron'

/**
 * Heberge l'UI DevTools dans une WebContentsView native ancree dans la fenetre, plutot
 * que dans un <webview> (qui rend une UI vide). Le renderer reserve l'espace du panneau
 * et transmet ses dimensions ; cette vue native est positionnee par-dessus.
 */
class BrowserDevtoolsHost {
  private view: WebContentsView | null = null
  private window: BrowserWindow | null = null
  private guest: WebContents | null = null

  attach(
    window: BrowserWindow,
    guest: WebContents,
    bounds: Rectangle,
    inspect?: { x: number; y: number },
  ): void {
    if (!this.view) {
      this.view = new WebContentsView()
      this.window = window
      window.contentView.addChildView(this.view)
    }

    // Bascule de cible : on ferme les DevTools de l'ancien onglet avant de rattacher.
    if (this.guest && !this.guest.isDestroyed() && this.guest.id !== guest.id) {
      this.guest.closeDevTools()
    }
    this.guest = guest

    this.view.setBounds(bounds)
    this.view.setVisible(true)
    guest.setDevToolsWebContents(this.view.webContents)
    // IMPORTANT : avec setDevToolsWebContents, il faut ouvrir en mode 'detach' pour que le
    // frontend DevTools soit rendu dans la webContents fournie (sinon le panneau reste vide).
    guest.openDevTools({ mode: 'detach' })
    if (inspect) {
      guest.inspectElement(inspect.x, inspect.y)
    }
  }

  setBounds(bounds: Rectangle, visible: boolean): void {
    if (!this.view) {
      return
    }
    this.view.setVisible(visible)
    if (visible) {
      this.view.setBounds(bounds)
    }
  }

  destroy(): void {
    if (this.guest && !this.guest.isDestroyed()) {
      this.guest.closeDevTools()
    }
    if (this.view && this.window) {
      this.window.contentView.removeChildView(this.view)
      try {
        this.view.webContents.close()
      } catch {
        // Deja detruite, rien a faire.
      }
    }
    this.view = null
    this.window = null
    this.guest = null
  }
}

export const browserDevtoolsHost = new BrowserDevtoolsHost()

import { Notification } from 'electron'

export class NativeNotificationService {
  show(notification: { title: string; body?: string }): void {
    if (!Notification.isSupported()) {
      return
    }

    new Notification({
      title: notification.title,
      body: notification.body,
      // Banniere silencieuse : le son est joue cote renderer (PJ3 pour les notifs,
      // chirp pour Elodie), ce qui permet un mp3 et un volume controles. macOS ne
      // sait de toute facon pas lire un fichier sonore arbitraire via cette API.
      silent: true,
    }).show()
  }
}

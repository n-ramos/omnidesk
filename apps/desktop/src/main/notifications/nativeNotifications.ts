import { Notification } from 'electron'
import { logger } from '@main/logger'

export class NativeNotificationService {
  show(notification: { title: string; body?: string }): void {
    if (!Notification.isSupported()) {
      logger.warn('notifications: notifications natives non supportees par la plateforme')
      return
    }

    const native = new Notification({
      title: notification.title,
      body: notification.body,
      // Banniere silencieuse : le son est joue cote renderer (PJ3 pour les notifs,
      // chirp pour Elodie), ce qui permet un mp3 et un volume controles. macOS ne
      // sait de toute facon pas lire un fichier sonore arbitraire via cette API.
      silent: true,
    })
    // macOS n'expose pas d'API de demande de permission pour les notifications locales : le
    // systeme enregistre l'app (Reglages > Notifications) au premier envoi, sans invite modale.
    // L'event 'failed' (specifique macOS) remonte un refus de permission ou une app mal signee /
    // lancee hors /Applications -> on le journalise pour pouvoir diagnostiquer dans main.log.
    native.on('failed', (_event, error) => {
      logger.warn('notifications: affichage natif refuse par le systeme', { error })
    })
    logger.info('notifications: affichage notification native')
    native.show()
  }
}

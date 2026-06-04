import { app, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { logger } from '@main/logger'
import { errorMessage } from '@shared/errors'
import { PRELOAD_EVENTS, type AppUpdateStatus } from '@shared/ipc'

// checkForUpdatesAndNotify ne s'execute qu'au lancement : pour les sessions longues
// on relance un controle periodique afin de ne pas rater une release publiee apres
// l'ouverture de l'app. Ici toutes les 10 minutes.
const RECHECK_INTERVAL_MS = 10 * 60 * 1000

type GetWindow = () => BrowserWindow | null

let getWindow: GetWindow = () => null
let lastStatus: AppUpdateStatus = { phase: 'idle' }
let started = false

const broadcast = (status: AppUpdateStatus): void => {
  lastStatus = status
  getWindow()?.webContents.send(PRELOAD_EVENTS.UPDATE_STATUS, status)
}

export const autoUpdate = {
  /** Dernier etat connu, pour amorcer l'UI au montage du renderer. */
  getStatus(): AppUpdateStatus {
    return lastStatus
  },

  /**
   * Cable electron-updater et lance la premiere verification. No-op hors paquet
   * (en dev il n'y a pas de feed : checkForUpdates leverait une erreur) et
   * idempotent : les listeners ne sont attaches qu'une seule fois.
   */
  init(options: { getWindow: GetWindow }): void {
    getWindow = options.getWindow
    if (!app.isPackaged || started) {
      return
    }
    started = true

    autoUpdater.logger = logger
    autoUpdater.autoDownload = true

    autoUpdater.on('checking-for-update', () => broadcast({ phase: 'checking' }))
    autoUpdater.on('update-available', (info) =>
      broadcast({ phase: 'available', version: info.version }),
    )
    autoUpdater.on('update-not-available', () => broadcast({ phase: 'idle' }))
    autoUpdater.on('download-progress', (progress) =>
      broadcast({ phase: 'downloading', percent: Math.round(progress.percent) }),
    )
    autoUpdater.on('update-downloaded', (info) =>
      broadcast({ phase: 'downloaded', version: info.version }),
    )
    autoUpdater.on('error', (error) => {
      logger.error('Auto-update failed', error)
      broadcast({ phase: 'error', message: errorMessage(error, 'Echec de la mise a jour.') })
    })

    // Telecharge en arriere-plan et affiche une notif native quand la MAJ est prete
    // (complement a l'indicateur in-app, utile lorsque la fenetre est masquee). On passe
    // un texte FR : sans downloadNotification, electron-updater affiche sa banniere par
    // defaut en anglais ("A new update is ready to install").
    void autoUpdater.checkForUpdatesAndNotify({
      title: 'Mise a jour prete',
      body: 'Omnidesk {version} a ete telechargee et sera installee a la fermeture.',
    })
    setInterval(() => {
      void autoUpdater.checkForUpdates()
    }, RECHECK_INTERVAL_MS)
  },

  /** Verification manuelle declenchee par l'UI. */
  async checkForUpdates(): Promise<void> {
    if (!app.isPackaged) {
      return
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      logger.error('Manual update check failed', error)
      broadcast({ phase: 'error', message: errorMessage(error, 'Verification impossible.') })
    }
  },

  /** Redemarre l'app pour installer la MAJ deja telechargee. */
  installUpdate(): void {
    if (!app.isPackaged || lastStatus.phase !== 'downloaded') {
      return
    }
    autoUpdater.quitAndInstall()
  },
}

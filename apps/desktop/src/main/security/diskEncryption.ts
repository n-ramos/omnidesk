import { Notification } from 'electron'
import { execFile } from 'node:child_process'
import { logger } from '@main/logger'

export type DiskEncryptionStatus = 'on' | 'off' | 'unknown'

// La base SQLite n'est pas chiffree au niveau applicatif : la protection des donnees au
// repos repose sur le chiffrement disque de l'OS (FileVault sur macOS). `fdesetup status`
// ne demande aucun privilege. Sur les autres plateformes, on ne sait pas verifier
// simplement -> 'unknown' (on evite une fausse alerte).
const readFileVaultStatus = (): Promise<DiskEncryptionStatus> =>
  new Promise((resolve) => {
    execFile('/usr/bin/fdesetup', ['status'], { timeout: 5000 }, (error, stdout) => {
      if (error) {
        logger.warn('Unable to read FileVault status', error)
        resolve('unknown')
        return
      }
      resolve(/FileVault is On/i.test(stdout) ? 'on' : 'off')
    })
  })

export const getDiskEncryptionStatus = async (): Promise<DiskEncryptionStatus> => {
  if (process.platform !== 'darwin') {
    return 'unknown'
  }
  return readFileVaultStatus()
}

// A appeler une fois au demarrage (apres app.ready). Previent l'utilisateur, sans bloquer
// ni interrompre, si le chiffrement disque est desactive.
export const warnIfDiskUnencrypted = async (): Promise<void> => {
  const status = await getDiskEncryptionStatus()
  if (status !== 'off') {
    return
  }

  logger.warn('Disk encryption (FileVault) is OFF -- Omnidesk data at rest is unprotected')

  if (Notification.isSupported()) {
    new Notification({
      title: 'Chiffrement du disque desactive',
      body: 'Activez FileVault (Reglages Systeme > Confidentialite et securite) pour proteger vos donnees Omnidesk au repos.',
    }).show()
  }
}

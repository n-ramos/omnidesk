import { Buffer } from 'node:buffer'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { Database } from 'better-sqlite3'
import { AppError } from '@shared/errors'
import type { UUID } from '@shared/models'
import { AttachmentRepository } from '@main/database/repositories/attachmentRepository'
import { tokenVault } from '@main/security/tokenVault'

const sanitizeFileName = (value: string): string => {
  const trimmed = value.trim().replace(/[\\/:*?"<>|]/g, '_')
  return trimmed.length > 0 ? trimmed.slice(0, 120) : 'fichier'
}

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export interface AttachmentOpenResult {
  localPath: string
  fileName: string
  mimeType?: string
}

export class AttachmentDownloadService {
  private readonly attachments: AttachmentRepository

  constructor(db: Database) {
    this.attachments = new AttachmentRepository(db)
  }

  async ensureLocalCopy(attachmentId: UUID): Promise<AttachmentOpenResult> {
    const attachment = this.attachments.findForDownload(attachmentId)
    if (!attachment) {
      throw new AppError('DATABASE_ERROR', "Cette piece jointe est introuvable.")
    }

    if (attachment.localPath && (await fileExists(attachment.localPath))) {
      return {
        localPath: attachment.localPath,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
      }
    }

    if (!attachment.downloadUrl) {
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        "Aucune URL de telechargement pour cette piece jointe.",
      )
    }

    const accessToken = await tokenVault.getToken(
      attachment.providerId,
      attachment.accountId,
      'access',
    )
    if (!accessToken) {
      throw new AppError('AUTH_REQUIRED', 'Reconnectez ce compte avant de telecharger.')
    }

    const response = await fetch(attachment.downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        `Le telechargement a echoue (HTTP ${response.status}).`,
      )
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const directory = join(app.getPath('userData'), 'attachments')
    await mkdir(directory, { recursive: true })

    const safeName = sanitizeFileName(attachment.fileName)
    const localPath = join(directory, `${attachment.id}-${safeName}`)
    await writeFile(localPath, buffer)

    this.attachments.updateLocalPath(attachment.id, localPath)

    return {
      localPath,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
    }
  }
}

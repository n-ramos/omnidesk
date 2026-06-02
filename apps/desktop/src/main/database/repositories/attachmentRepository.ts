import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { Database } from 'better-sqlite3'
import type { AttachmentSummary, ProviderKind, UUID } from '@shared/models'
import type { ProviderMessageAttachment } from '@main/providers/provider.types'

const sanitizeFileName = (value: string): string => {
  const trimmed = value.trim().replace(/[\\/:*?"<>|]/g, '_')
  return trimmed.length > 0 ? trimmed.slice(0, 120) : 'fichier'
}

const attachmentsDirectory = (): string => {
  const directory = join(app.getPath('userData'), 'attachments')
  mkdirSync(directory, { recursive: true })
  return directory
}

interface AttachmentRow {
  id: string
  message_id: string
  external_attachment_id?: string
  file_name: string
  mime_type?: string
  byte_size?: number
  download_url?: string
  local_path?: string
}

export interface AttachmentDownloadRecord {
  id: UUID
  accountId: UUID
  providerId: ProviderKind
  fileName: string
  mimeType?: string
  downloadUrl?: string
  localPath?: string
}

const mapRow = (row: AttachmentRow): AttachmentSummary => ({
  id: row.id,
  externalAttachmentId: row.external_attachment_id,
  fileName: row.file_name,
  mimeType: row.mime_type,
  byteSize: row.byte_size ?? undefined,
  downloadUrl: row.download_url,
  canOpen: Boolean(row.local_path) || Boolean(row.download_url),
})

export class AttachmentRepository {
  constructor(private readonly db: Database) {}

  replaceForMessage(
    messageId: UUID,
    providerId: ProviderKind,
    attachments: ProviderMessageAttachment[] | undefined,
  ): AttachmentSummary[] {
    const deleteStatement = this.db.prepare(`DELETE FROM attachments WHERE message_id = ?`)
    const insertStatement = this.db.prepare(
      `INSERT INTO attachments (
        id,
        provider_id,
        message_id,
        external_attachment_id,
        file_name,
        mime_type,
        byte_size,
        download_url,
        local_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    const planned: Array<{
      id: UUID
      attachment: ProviderMessageAttachment
      fileName: string
      localPath?: string
    }> = []

    for (const attachment of attachments ?? []) {
      const fileName = attachment.fileName.trim()
      if (!fileName) {
        continue
      }

      const id = randomUUID()
      let localPath: string | undefined
      if (Buffer.isBuffer(attachment.content) && attachment.content.length > 0) {
        const safeName = sanitizeFileName(fileName)
        localPath = join(attachmentsDirectory(), `${id}-${safeName}`)
        writeFileSync(localPath, attachment.content)
      }

      planned.push({ id, attachment, fileName, localPath })
    }

    const inserted: AttachmentSummary[] = []

    const transaction = this.db.transaction(() => {
      deleteStatement.run(messageId)

      for (const { id, attachment, fileName, localPath } of planned) {
        insertStatement.run(
          id,
          providerId,
          messageId,
          attachment.externalAttachmentId ?? null,
          fileName,
          attachment.mimeType ?? null,
          typeof attachment.byteSize === 'number' ? attachment.byteSize : null,
          attachment.downloadUrl ?? null,
          localPath ?? null,
        )

        inserted.push({
          id,
          externalAttachmentId: attachment.externalAttachmentId,
          fileName,
          mimeType: attachment.mimeType,
          byteSize: attachment.byteSize,
          downloadUrl: attachment.downloadUrl,
          canOpen: Boolean(localPath) || Boolean(attachment.downloadUrl),
        })
      }
    })

    transaction()
    return inserted
  }

  findForDownload(attachmentId: UUID): AttachmentDownloadRecord | null {
    const row = this.db
      .prepare(
        `SELECT attachments.id AS id,
                attachments.file_name AS file_name,
                attachments.mime_type AS mime_type,
                attachments.download_url AS download_url,
                attachments.local_path AS local_path,
                messages.account_id AS account_id,
                messages.provider_id AS provider_id
         FROM attachments
         INNER JOIN messages ON messages.id = attachments.message_id
         WHERE attachments.id = ?`,
      )
      .get(attachmentId) as
      | {
          id: string
          file_name: string
          mime_type?: string
          download_url?: string
          local_path?: string
          account_id: string
          provider_id: ProviderKind
        }
      | undefined

    if (!row) {
      return null
    }

    return {
      id: row.id,
      accountId: row.account_id,
      providerId: row.provider_id,
      fileName: row.file_name,
      mimeType: row.mime_type,
      downloadUrl: row.download_url,
      localPath: row.local_path,
    }
  }

  updateLocalPath(attachmentId: UUID, localPath: string): void {
    this.db
      .prepare(`UPDATE attachments SET local_path = ? WHERE id = ?`)
      .run(localPath, attachmentId)
  }

  getForMessage(messageId: UUID): AttachmentSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id, message_id, external_attachment_id, file_name, mime_type, byte_size, download_url, local_path
         FROM attachments
         WHERE message_id = ?
         ORDER BY created_at ASC`,
      )
      .all(messageId) as AttachmentRow[]

    return rows.map(mapRow)
  }

  getForConversation(conversationId: UUID): Map<string, AttachmentSummary[]> {
    const rows = this.db
      .prepare(
        `SELECT attachments.id,
                attachments.message_id,
                attachments.external_attachment_id,
                attachments.file_name,
                attachments.mime_type,
                attachments.byte_size,
                attachments.download_url,
                attachments.local_path
         FROM attachments
         INNER JOIN messages ON messages.id = attachments.message_id
         WHERE messages.conversation_id = ?
         ORDER BY attachments.created_at ASC`,
      )
      .all(conversationId) as AttachmentRow[]

    const grouped = new Map<string, AttachmentSummary[]>()
    for (const row of rows) {
      const bucket = grouped.get(row.message_id)
      const summary = mapRow(row)
      if (bucket) {
        bucket.push(summary)
      } else {
        grouped.set(row.message_id, [summary])
      }
    }
    return grouped
  }
}

import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { z } from 'zod'
import { AppError, toSafeError } from '@shared/errors'
import type { IpcChannel, IpcRequestMap, IpcResponseMap } from '@shared/ipc'
import { logger } from '@main/logger'

type Handler<Channel extends IpcChannel> = (
  payload: IpcRequestMap[Channel],
  event: IpcMainInvokeEvent,
) => Promise<IpcResponseMap[Channel]> | IpcResponseMap[Channel]

// options.redactPayload : pour les canaux portant un secret (mot de passe maitre du coffre), on
// ne journalise JAMAIS le payload en cas d'echec de validation -- sinon le mot de passe maitre
// finirait en clair dans le fichier de logs. Les `issues` Zod (code/chemin/message, sans valeur)
// restent sures a journaliser.
export const registerValidatedHandler = <Channel extends IpcChannel>(
  channel: Channel,
  schema: z.ZodType<IpcRequestMap[Channel]>,
  handler: Handler<Channel>,
  options?: { redactPayload?: boolean },
): void => {
  ipcMain.handle(channel, async (_event, payload: unknown) => {
    try {
      const parsedPayload = schema.safeParse(payload)

      if (!parsedPayload.success) {
        const summary = parsedPayload.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; ')
        logger.error(`IPC validation failed: ${channel}`, {
          payload: options?.redactPayload ? '[redacted]' : payload,
          issues: parsedPayload.error.issues,
        })
        throw new AppError(
          'VALIDATION_FAILED',
          summary ? `Invalid IPC payload (${channel}): ${summary}` : `Invalid IPC payload (${channel}).`,
        )
      }

      return await handler(parsedPayload.data, _event)
    } catch (error) {
      logger.error(`IPC handler failed: ${channel}`, error)
      throw toSafeError(error)
    }
  })
}

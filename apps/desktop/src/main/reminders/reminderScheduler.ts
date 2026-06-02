import type { Database } from 'better-sqlite3'
import { NotificationRepository } from '@main/database/repositories/notificationRepository'
import { ReminderRepository } from '@main/database/repositories/reminderRepository'
import { eventBus } from '@main/events/eventBus'
import { logger } from '@main/logger'
import { AppError } from '@shared/errors'
import type { CreateReminderInput, Reminder, UpdateReminderInput } from '@shared/models'
import { computeNextOccurrence } from './recurrence'

const TICK_INTERVAL_MS = 30_000

export class ReminderScheduler {
  private timer?: ReturnType<typeof setInterval>
  private readonly reminders: ReminderRepository
  private readonly notifications: NotificationRepository

  constructor(db: Database) {
    this.reminders = new ReminderRepository(db)
    this.notifications = new NotificationRepository(db)
  }

  start(): void {
    if (this.timer) {
      return
    }
    this.tick()
    this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  list(): Reminder[] {
    return this.reminders.list()
  }

  create(input: CreateReminderInput): Reminder {
    const now = new Date()
    const next = computeNextOccurrence(input.recurrence, now, now)
    if (!next) {
      throw new AppError(
        'VALIDATION_FAILED',
        "Cette echeance est deja passee. Choisissez une date ou une heure future.",
      )
    }
    return this.reminders.create(input, next.toISOString())
  }

  update(input: UpdateReminderInput): Reminder {
    const existing = this.reminders.get(input.id)
    if (!existing) {
      throw new AppError('VALIDATION_FAILED', "Ce pense-bete n'existe plus.")
    }

    const recurrenceChanged = input.recurrence !== undefined
    const becomesEnabled = input.isEnabled === true && !existing.isEnabled

    let nextOccurrenceAt: string | undefined
    if (recurrenceChanged || becomesEnabled) {
      const now = new Date()
      const recurrence = input.recurrence ?? existing.recurrence
      const next = computeNextOccurrence(recurrence, now, now)
      if (!next) {
        throw new AppError(
          'VALIDATION_FAILED',
          "Cette echeance est deja passee. Choisissez une date ou une heure future.",
        )
      }
      nextOccurrenceAt = next.toISOString()
    }

    return this.reminders.update(input, nextOccurrenceAt)
  }

  delete(id: string): void {
    this.reminders.delete(id)
  }

  private tick(): void {
    try {
      const now = new Date()
      const nowIso = now.toISOString()
      const due = this.reminders.findDue(nowIso)
      for (const reminder of due) {
        const notification = this.notifications.create({
          level: 'info',
          title: reminder.title,
          body: reminder.body,
        })
        // Rappel = domaine d'Elodie : on emet seulement reminder:fired. Le main
        // affiche la banniere native silencieuse et la mascotte joue son chirp
        // (pas le son de notification PJ3, reserve aux notifs hors Elodie).
        eventBus.emit('reminder:fired', notification)

        const next = computeNextOccurrence(reminder.recurrence, now, now)
        this.reminders.markFired(reminder.id, nowIso, next?.toISOString())
      }
    } catch (error) {
      logger.error('ReminderScheduler tick failed', error)
    }
  }
}

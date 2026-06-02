import type { ReminderRecurrence, Weekday } from '@shared/models'

const parseTimeOfDay = (value: string): { hours: number; minutes: number } => {
  const [hPart = '', mPart = ''] = value.split(':')
  const hours = Number.parseInt(hPart, 10)
  const minutes = Number.parseInt(mPart, 10)
  if (
    Number.isNaN(hours) || Number.isNaN(minutes)
    || hours < 0 || hours > 23
    || minutes < 0 || minutes > 59
  ) {
    throw new Error(`Heure invalide : ${value}`)
  }
  return { hours, minutes }
}

const jsDayToIso = (jsDay: number): Weekday => (jsDay === 0 ? 7 : jsDay) as Weekday

const localCandidate = (
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
): Date => new Date(year, month, day, hours, minutes, 0, 0)

const lastDayOfMonth = (year: number, month: number): number =>
  new Date(year, month + 1, 0).getDate()

export const computeNextOccurrence = (
  recurrence: ReminderRecurrence,
  after: Date,
  anchor?: Date,
): Date | undefined => {
  switch (recurrence.kind) {
    case 'once': {
      const scheduled = new Date(recurrence.scheduledAt)
      if (Number.isNaN(scheduled.getTime())) {
        return undefined
      }
      return scheduled > after ? scheduled : undefined
    }
    case 'daily': {
      const { hours, minutes } = parseTimeOfDay(recurrence.timeOfDay)
      const today = localCandidate(
        after.getFullYear(),
        after.getMonth(),
        after.getDate(),
        hours,
        minutes,
      )
      if (today > after) {
        return today
      }
      return localCandidate(
        after.getFullYear(),
        after.getMonth(),
        after.getDate() + 1,
        hours,
        minutes,
      )
    }
    case 'weekly': {
      if (recurrence.weekdays.length === 0) {
        return undefined
      }
      const { hours, minutes } = parseTimeOfDay(recurrence.timeOfDay)
      const allowed = new Set<Weekday>(recurrence.weekdays)
      for (let offset = 0; offset < 14; offset++) {
        const candidate = localCandidate(
          after.getFullYear(),
          after.getMonth(),
          after.getDate() + offset,
          hours,
          minutes,
        )
        if (allowed.has(jsDayToIso(candidate.getDay())) && candidate > after) {
          return candidate
        }
      }
      return undefined
    }
    case 'monthly': {
      const { hours, minutes } = parseTimeOfDay(recurrence.timeOfDay)
      const day = recurrence.dayOfMonth
      for (let offset = 0; offset < 24; offset++) {
        const year = after.getFullYear()
        const month = after.getMonth() + offset
        const candidate = localCandidate(
          year,
          month,
          Math.min(day, lastDayOfMonth(year, month)),
          hours,
          minutes,
        )
        if (candidate > after) {
          return candidate
        }
      }
      return undefined
    }
    case 'interval': {
      const everyMs = recurrence.everyMinutes * 60_000
      if (everyMs <= 0) {
        return undefined
      }
      const baseline = anchor ?? after
      const candidate = new Date(baseline.getTime() + everyMs)
      if (candidate > after) {
        return candidate
      }
      const offsetMs = after.getTime() - baseline.getTime()
      const steps = Math.floor(offsetMs / everyMs) + 1
      return new Date(baseline.getTime() + steps * everyMs)
    }
    default:
      return undefined
  }
}

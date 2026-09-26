import type { SessionRecord } from '../types/session'

export interface Week {
  /** Midnight of each day, first day of the week first. */
  days: number[]
  byDay: SessionRecord[][]
  today: number
  done: number
  /** Days left including today. */
  daysLeft: number
}

/** This calendar week, day by day, starting on the locale's first weekday. */
export function weekOf(sessions: SessionRecord[], now: Date, weekStartsOn: number): Week {
  const today = new Date(now).setHours(0, 0, 0, 0)
  const offset = (new Date(today).getDay() - weekStartsOn + 7) % 7
  // Eight midnights bound the seven days. setDate rather than + n * DAY_MS, so
  // a daylight-saving change mid-week can't shift a boundary.
  const bounds = Array.from({ length: 8 }, (_, i) => new Date(today).setDate(new Date(today).getDate() - offset + i))
  const days = bounds.slice(0, 7)
  const byDay = days.map((start, i) =>
    sessions.filter((x) => {
      const t = Date.parse(x.started_at)
      return t >= start && t < bounds[i + 1]
    }),
  )
  return { days, byDay, today, done: byDay.reduce((n, list) => n + list.length, 0), daysLeft: 7 - offset }
}

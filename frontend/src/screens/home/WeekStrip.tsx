import { useLanguage } from '../../lib/language'
import type { Week } from '../../lib/week'

type Status = 'done' | 'today' | 'missed' | 'upcoming'

// A week of dates, like the top row of a paper calendar: filled where a
// session happened, outlined for today. Missed days stay plain; the point is
// the rhythm, not a scorecard.
export function WeekStrip({ week, plan }: { week: Week; plan: number }) {
  const { s } = useLanguage()
  const { days, byDay, today, done } = week

  return (
    <div className="w-full sm:w-auto">
      <p className="flex items-baseline justify-between gap-6 text-sm">
        <span className="font-bold">{s.thisWeek}</span>
        <span className={`font-semibold tabular-nums ${done >= plan ? 'text-good' : 'text-ink-2'}`}>{s.weekCount(done, plan)}</span>
      </p>
      <ol className="mt-3 grid grid-cols-7 gap-1 sm:gap-1.5" aria-label={`${s.thisWeek}: ${s.weekCount(done, plan)}`}>
        {days.map((start, i) => {
          const list = byDay[i]
          const status: Status = list.length ? 'done' : start === today ? 'today' : start < today ? 'missed' : 'upcoming'
          const date = new Date(start)
          const name = date.toLocaleDateString(s.locale, { weekday: 'long', day: 'numeric' })
          const times = list.map((x) => new Date(x.started_at).toLocaleTimeString(s.locale, { hour: 'numeric', minute: '2-digit' }))
          return (
            <li key={start} className="flex flex-col items-center" title={times.length ? `${name} · ${times.join(', ')}` : undefined}>
              <span className={`text-[11px] font-semibold uppercase ${start === today ? 'text-ink' : 'text-muted'}`} aria-hidden="true">
                {date.toLocaleDateString(s.locale, { weekday: 'narrow' })}
              </span>
              <span aria-hidden="true" className={`mt-1 grid h-10 w-full min-w-9 place-items-center rounded-[10px] text-[15px] font-bold tabular-nums sm:w-10 ${DAY[status]}`}>
                {date.getDate()}
              </span>
              {/* One tick per session, so a double day reads as two. */}
              <span className="mt-1 flex h-1 gap-0.5" aria-hidden="true">
                {list.map((x) => (
                  <span key={x.id} className="size-1 rounded-full bg-brand-ink" />
                ))}
              </span>
              <span className="sr-only">
                {name}: {status === 'done' ? s.daySessions(list.length) : status === 'upcoming' ? s.dayUpcoming : status === 'today' ? s.dayToday : s.dayNone}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

const DAY: Record<Status, string> = {
  done: 'bg-brand text-on-brand',
  today: 'text-ink ring-2 ring-inset ring-ink',
  missed: 'bg-raised text-muted',
  upcoming: 'text-muted ring-1 ring-inset ring-line',
}

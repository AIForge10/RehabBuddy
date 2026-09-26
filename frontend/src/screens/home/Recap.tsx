import { useMemo, useState, type ReactNode } from 'react'
import { useLanguage } from '../../lib/language'
import type { SessionRecord } from '../../types/session'
import { TrendChart } from './TrendChart'

const DAY_MS = 86_400_000
const dayStart = (t: number | string) => new Date(t).setHours(0, 0, 0, 0)

/** "Yesterday · 5:12 PM", "Today · 9:03 AM", or "Mon, Sep 21 · 5:40 PM". */
function when(iso: string, locale: string): string {
  const d = new Date(iso)
  const days = Math.round((dayStart(Date.now()) - dayStart(iso)) / DAY_MS)
  const day =
    days <= 1
      ? new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days === 0 ? 0 : -days, 'day')
      : d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}`
}

/** Last session's numbers, with the trend chart as a picker for any earlier one. */
export function Recap({ sessions, target, reps }: { sessions: SessionRecord[]; target: number; reps: number }) {
  const { s } = useLanguage()
  const ordered = useMemo(() => [...sessions].sort((a, b) => a.started_at.localeCompare(b.started_at)), [sessions])
  // A hover previews a session; a click, tap or key pins it until "Back to latest".
  const [hovered, setHovered] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const n = ordered.length

  if (n === 0) {
    return (
      <Card>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">{s.lastSession}</p>
        <p className="mt-auto max-w-[24ch] pt-10 font-display text-2xl leading-tight text-ink-2">{s.recapEmpty}</p>
      </Card>
    )
  }

  const i = hovered ?? pinned ?? n - 1
  const cur = ordered[i]
  const prev = i > 0 ? ordered[i - 1] : null
  const delta = prev ? cur.max_angle - prev.max_angle : 0
  const hit = cur.max_angle >= target
  const gain = ordered[n - 1].max_angle - ordered[0].max_angle
  const notes = cur.form_warnings.length
  const shortDate = (iso: string) => new Date(iso).toLocaleDateString(s.locale, { month: 'short', day: 'numeric' })

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-muted">{i === n - 1 ? s.lastSession : s.sessionNumber(i + 1)}</h2>
        <p className="text-right text-sm font-semibold text-ink-2">{when(cur.started_at, s.locale)}</p>
      </div>

      <p className="mt-4 text-sm font-semibold text-ink-2">{s.doneDeepest}</p>
      <p className="font-display text-[64px] leading-[1.05] sm:text-[72px]">
        {cur.max_angle}
        <span className="text-muted">°</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Chip tone={delta > 0 ? 'good' : 'neutral'}>{prev ? s.vsPrevious(delta) : s.doneFirst}</Chip>
        <Chip tone={hit ? 'good' : 'brand'} icon={hit}>
          {hit ? s.goalHit : s.toGo(target - cur.max_angle)}
        </Chip>
      </div>

      <dl className="mt-6 grid grid-cols-3 divide-x divide-line rounded-2xl bg-raised py-3.5 ring-1 ring-line">
        <Stat label={s.doneReps}>
          {cur.reps_done}
          <span className="text-sm font-medium text-muted">/{reps}</span>
        </Stat>
        <Stat label={s.doneForm} sub={cur.form_warnings[0]}>
          <span className={notes ? 'text-warn' : 'text-good'}>{notes ? s.formNotes(notes) : s.doneFormClean}</span>
        </Stat>
        <Stat label={s.pain}>
          {cur.pain_score == null ? (
            <span className="text-muted">—</span>
          ) : (
            <>
              <span
                aria-hidden="true"
                className={`mr-1.5 inline-block size-2.5 rounded-full align-middle ${cur.pain_score <= 3 ? 'bg-pain-1' : cur.pain_score <= 6 ? 'bg-pain-2' : 'bg-pain-3'}`}
              />
              {cur.pain_score}
              <span className="text-sm font-medium text-muted">/10</span>
            </>
          )}
        </Stat>
      </dl>

      {n > 1 ? (
        <div className="mt-6 flex min-h-0 flex-1 flex-col">
          <p className="text-sm font-bold">
            {s.doneProgress}
            {gain > 0 && <span className="font-semibold text-brand-ink"> · {s.sinceStart(gain)}</span>}
          </p>
          <TrendChart
            points={ordered.map((x, k) => ({
              value: x.max_angle,
              label: shortDate(x.started_at),
              valueText: `${s.sessionNumber(k + 1)}, ${shortDate(x.started_at)}: ${x.max_angle}°`,
            }))}
            target={target}
            targetLabel={`${s.target} ${target}°`}
            active={i}
            engaged={hovered != null || pinned != null}
            onHover={setHovered}
            onPick={(k) => setPinned(k === n - 1 ? null : k)}
            label={s.doneProgressSub}
            className="mt-2 h-44 lg:h-auto lg:min-h-44 lg:flex-1"
          />
          {/* The hint and the way back share one slot, so pinning never shifts the layout. */}
          <div className="mt-1 flex h-9 items-center justify-center">
            {pinned == null ? (
              <p className="text-xs text-muted">{s.chartHint}</p>
            ) : (
              <button
                type="button"
                onClick={() => setPinned(null)}
                className="relative inline-flex h-8 animate-rise items-center gap-1 rounded-full bg-brand-soft px-3.5 text-xs font-bold text-brand-ink transition-colors after:absolute after:-inset-y-2 after:inset-x-0 hover:bg-brand-track"
              >
                {s.backToLatest}
                <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 8h9m-3.5-3.5L12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-6 rounded-2xl bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-ink">{s.oneMore}</p>
      )}
    </Card>
  )
}

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="flex animate-rise flex-col rounded-[32px] bg-surface p-6 shadow-card ring-1 ring-line [animation-delay:90ms] sm:p-8">
      {children}
    </section>
  )
}

function Chip({ children, tone, icon = false }: { children: ReactNode; tone: 'good' | 'brand' | 'neutral'; icon?: boolean }) {
  const tones = {
    good: 'bg-good/10 text-good',
    brand: 'bg-brand-soft text-brand-ink',
    neutral: 'bg-raised text-ink-2 ring-1 ring-line',
  }
  return (
    <span className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold ${tones[tone]}`}>
      {icon && (
        <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true">
          <path d="m2.5 6.2 2.2 2.1L9.5 3.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {children}
    </span>
  )
}

function Stat({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 px-3 sm:px-4">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-bold tabular-nums">{children}</dd>
      {sub && <dd className="truncate text-xs text-muted">{sub}</dd>}
    </div>
  )
}

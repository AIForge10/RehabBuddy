import { useMemo, useState } from 'react'
import { DegreeScale } from '../../components/DegreeScale'
import { FormNotes } from '../../components/FormNotes'
import { PainDot, Row, Rows, Section } from '../../components/Ledger'
import type { Exercise } from '../../lib/exercises'
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

/**
 * Last session's numbers beside the trend, which doubles as a picker for any
 * earlier session. Two open sections under a rule rather than two cards: the
 * dark band above is the only boxed thing on the page.
 */
export function Recap({ sessions, target, reps, exercise }: { sessions: SessionRecord[]; target: number; reps: number; exercise: Exercise }) {
  const { s } = useLanguage()
  const ordered = useMemo(() => [...sessions].sort((a, b) => a.started_at.localeCompare(b.started_at)), [sessions])
  // A hover previews a session; a click, tap or key pins it until "Back to latest".
  const [hovered, setHovered] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const n = ordered.length

  if (n === 0) {
    return (
      <Section title={s.lastSession} className="lg:col-span-12">
        <p className="mt-4 max-w-[36ch] text-lg text-ink-2">{s.recapEmpty}</p>
      </Section>
    )
  }

  const i = hovered ?? pinned ?? n - 1
  const cur = ordered[i]
  const prev = i > 0 ? ordered[i - 1] : null
  const delta = prev ? cur.max_angle - prev.max_angle : 0
  const hit = cur.max_angle >= target
  const gain = ordered[n - 1].max_angle - ordered[0].max_angle
  const shortDate = (iso: string) => new Date(iso).toLocaleDateString(s.locale, { month: 'short', day: 'numeric' })

  return (
    <>
      <Section
        title={i === n - 1 ? s.lastSession : s.sessionNumber(i + 1)}
        aside={when(cur.started_at, s.locale)}
        className="lg:col-span-5 xl:col-span-4"
      >
        <p className="label-mono mt-6 text-muted">{s.doneDeepest}</p>
        <p className="mt-2 font-display text-[72px] leading-none tabular-nums">
          {cur.max_angle}
          <span className="text-muted">°</span>
        </p>
        <DegreeScale value={cur.max_angle} target={target} min={exercise.min} max={exercise.max} className="mt-5" />
        {/* Goal first: it's the number the therapist set. Both halves stay on one line so hovering never reflows. */}
        <p className="mt-3 truncate text-[15px] font-semibold">
          <span className={hit ? 'text-good' : 'text-brand-ink'}>{hit ? s.goalHit : s.toGo(target - cur.max_angle)}</span>
          <span className="text-muted">
            <span aria-hidden="true"> · </span>
            {prev ? s.vsPrevious(delta) : s.doneFirst}
          </span>
        </p>

        <Rows className="mt-6">
          <Row label={s.doneReps}>
            {cur.reps_done}
            <span className="font-medium text-muted"> / {reps}</span>
          </Row>
          <Row label={s.doneForm}>
            <FormNotes warnings={cur.form_warnings} />
          </Row>
          <Row label={s.pain}>
            {cur.pain_score == null ? (
              <span className="text-muted">—</span>
            ) : (
              <>
                <PainDot score={cur.pain_score} />
                {cur.pain_score}
                <span className="font-medium text-muted"> / 10</span>
              </>
            )}
          </Row>
        </Rows>
      </Section>

      <Section
        title={s.doneProgress}
        aside={Math.round(gain) > 0 ? <span className="text-brand-ink">{s.sinceStart(gain)}</span> : undefined}
        className="flex flex-col lg:col-span-7 xl:col-span-8"
      >
        {n > 1 ? (
          <>
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
              className="mt-4 h-56 lg:h-auto lg:min-h-56 lg:flex-1"
            />
            {/* The hint and the way back share one slot, so pinning never shifts the layout. */}
            <div className="mt-1 flex h-9 items-center">
              {pinned == null ? (
                <p className="text-[13px] text-muted">{s.chartHint}</p>
              ) : (
                <button
                  type="button"
                  onClick={() => setPinned(null)}
                  className="relative -ml-2 inline-flex h-8 animate-rise items-center gap-1.5 rounded-lg px-2 text-[13px] font-bold text-brand-ink transition-colors after:absolute after:-inset-y-2 after:inset-x-0 hover:bg-brand-soft"
                >
                  {s.backToLatest}
                  <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 8h9m-3.5-3.5L12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="mt-4 max-w-[36ch] text-lg text-ink-2">{s.oneMore}</p>
        )}
      </Section>
    </>
  )
}

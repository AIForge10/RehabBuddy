import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { getSessionSamples } from '../../api/client'
import { ExerciseFigure } from '../../components/ExerciseFigure'
import { buttonClass } from '../../components/Screen'
import type { Exercise } from '../../lib/exercises'
import { formatDuration } from '../../lib/format'
import { GAP_MS, REACHED_WITHIN, angleAt, findReps, findingsFor, toTrace, type Finding, type Rep, type TracePoint } from '../../lib/replay'
import { useReducedMotion } from '../../lib/useReducedMotion'
import type { AngleSampleRow, SessionRecord } from '../../types/session'

// One session played back from its angle trace: the figure re-enacts it while
// a playhead runs along the whole session's curve, so the therapist sees how
// the patient moved, not just how far. Scrub the curve, or pick a rep to jump
// to it. Until it's played, the playhead rests on the session's deepest bend.

const SPEEDS = [1, 4, 8] as const
const CHART_H = 200
const PAD = { top: 16, right: 12, bottom: 26, left: 38 }

/** Traces already fetched: a session's trace never changes, and flipping back shouldn't flash. */
const cache = new Map<string, AngleSampleRow[]>()

type Load = { status: 'loading' } | { status: 'ready'; rows: AngleSampleRow[] } | { status: 'failed' }

interface Domain {
  lo: number
  hi: number
  step: number
}

export function SessionReplay({
  session,
  exercise,
  target,
  goal,
  autoPlay = false,
}: {
  session: SessionRecord
  exercise: Exercise
  target: number
  goal: number
  /** Start playing as soon as the trace is in (the therapist picked this session, or it just came in). */
  autoPlay?: boolean
}) {
  const reduced = useReducedMotion()
  const [load, setLoad] = useState<Load>(() => {
    const rows = cache.get(session.id)
    return rows ? { status: 'ready', rows } : { status: 'loading' }
  })

  useEffect(() => {
    if (cache.has(session.id)) return
    let alive = true
    getSessionSamples(session.id).then(
      (rows) => {
        // An empty answer may be a trace that hasn't landed yet; ask again next time.
        if (rows.length) cache.set(session.id, rows)
        if (alive) setLoad({ status: 'ready', rows })
      },
      () => alive && setLoad({ status: 'failed' }),
    )
    return () => {
      alive = false
    }
  }, [session.id])

  const rows = load.status === 'ready' ? load.rows : null
  const trace = useMemo(() => (rows ? toTrace(rows, session.started_at) : []), [rows, session.started_at])
  const reps = useMemo(() => findReps(trace, target), [trace, target])
  const findings = useMemo(() => findingsFor(reps, target, session.stats), [reps, target, session.stats])
  const domain = useMemo(() => domainFor(trace, target, exercise), [trace, target, exercise])
  const deepest = useMemo(() => trace.reduce<TracePoint | null>((best, p) => (!best || p.angle > best.angle ? p : best), null), [trace])
  const duration = trace.at(-1)?.t ?? 0
  const ready = trace.length > 1

  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<number>(4)
  const [started, setStarted] = useState(false)
  const tRef = useRef(0)

  const seek = (next: number) => {
    tRef.current = Math.min(duration, Math.max(0, next))
    setT(tRef.current)
    setStarted(true)
  }
  const play = () => {
    if (!started || tRef.current >= duration) seek(0)
    setPlaying(true)
  }
  const scrub = (next: number) => {
    setPlaying(false)
    seek(next)
  }

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      tRef.current = Math.min(duration, tRef.current + (now - last) * speed)
      last = now
      setT(tRef.current)
      if (tRef.current >= duration) setPlaying(false)
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, duration])

  // Once, when the trace arrives. Reduced motion waits for the therapist to press play.
  const autoPlayed = useRef(false)
  useEffect(() => {
    if (!autoPlay || reduced || !ready || autoPlayed.current) return
    autoPlayed.current = true
    tRef.current = 0
    setT(0)
    setStarted(true)
    setPlaying(true)
  }, [autoPlay, reduced, ready])

  const at = started ? t : (deepest?.t ?? 0)
  const angle = ready ? angleAt(trace, at) : null
  const reached = angle != null && angle >= target - REACHED_WITHIN
  const done = reps.filter((r) => r.end <= at).length
  const current = reps.find((r) => at >= r.start && at <= r.end)
  const ended = started && at >= duration

  const date = new Date(session.started_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const stageLabel = !started ? 'Deepest bend' : ended ? 'End of session' : playing ? `Replay · ${speed}×` : 'Paused'

  return (
    <div className="px-6 pb-7 pt-1 sm:px-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="label-mono text-muted">Replay · {date}</p>
        <p className="text-sm tabular-nums text-ink-2">
          Peak <span className="font-bold text-ink">{session.max_angle}°</span> · {session.reps_done}/{goal} reps · {formatDuration(session.duration_sec)}
          {session.pain_score != null && (
            <>
              {' '}
              · pain <span className={session.flagged ? 'font-bold text-critical' : ''}>{session.pain_score}/10</span>
            </>
          )}
        </p>
      </div>

      <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:items-start">
        <div className="relative h-56 overflow-hidden rounded-2xl bg-stage text-white sm:h-64 xl:aspect-[16/10] xl:h-auto">
          <ExerciseFigure exercise={exercise} angle={angle} target={target} showLabel={false} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />
          <p className="label-mono absolute left-4 top-4 text-white/60">{stageLabel}</p>
          <span
            className={`label-mono absolute right-3.5 top-3.5 rounded-full bg-brand-glow px-2.5 py-1 text-[10px] text-stage transition-opacity duration-300 ${reached ? 'opacity-100' : 'opacity-0'}`}
          >
            At target
          </span>
          <p className="absolute bottom-3 left-4 text-5xl font-bold leading-none tracking-tighter tabular-nums">
            {angle == null ? '—' : Math.round(angle)}
            <span className="text-3xl font-normal text-white/45">°</span>
          </p>
          <p className="absolute bottom-3 right-4 text-right leading-none">
            <span className="label-mono block text-white/60">{started ? 'Reps' : 'Rep'}</span>
            <span className="mt-1 block text-2xl font-bold tabular-nums">
              {started ? done : (current?.n ?? '—')}
              <span className="text-base font-medium text-white/45"> / {started ? goal : reps.length}</span>
            </span>
          </p>
        </div>

        <div className="min-w-0">
          {load.status === 'loading' ? (
            <div className="animate-pulse rounded-2xl bg-raised" style={{ height: CHART_H }} />
          ) : !ready ? (
            <p className="grid place-items-center rounded-2xl px-6 text-center text-muted ring-1 ring-line" style={{ height: CHART_H }}>
              {load.status === 'failed' ? 'Couldn’t load this session’s angle trace.' : 'No angle trace was recorded for this session.'}
            </p>
          ) : (
            <TraceChart
              trace={trace}
              reps={reps}
              target={target}
              domain={domain}
              duration={duration}
              deepestAt={deepest?.t ?? 0}
              at={at}
              angle={angle}
              started={started}
              current={current}
              onScrub={scrub}
              onToggle={() => (playing ? setPlaying(false) : play())}
            />
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              onClick={() => (playing ? setPlaying(false) : play())}
              disabled={!ready}
              className={`${buttonClass('secondary', 'md')} h-10 w-[108px] px-3.5 text-sm`}
            >
              {playing ? <PauseIcon /> : ended ? <ReplayIcon /> : <PlayIcon />}
              {playing ? 'Pause' : ended ? 'Replay' : 'Play'}
            </button>
            <p className="text-sm tabular-nums text-ink-2">
              <span className="font-bold text-ink">{formatDuration(Math.floor(at / 1000))}</span> / {formatDuration(Math.round(duration / 1000))}
            </p>
            <div role="group" aria-label="Playback speed" className="ml-auto flex rounded-xl p-0.5 ring-1 ring-line-strong">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  aria-pressed={speed === s}
                  onClick={() => setSpeed(s)}
                  className={`h-9 rounded-[10px] px-3 text-sm font-bold tabular-nums transition-colors ${speed === s ? 'bg-ink text-canvas' : 'text-ink-2 hover:text-ink'}`}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {ready && (
        <div className="mt-7 grid gap-7 md:grid-cols-2">
          <RepStrip
            reps={reps}
            target={target}
            domain={domain}
            current={started ? current?.n : undefined}
            onPick={(r) => {
              seek(r.start)
              setPlaying(true)
            }}
          />
          <Findings findings={findings} />
        </div>
      )}
    </div>
  )
}

/** The angle axis: from rest (or the exercise's floor) to just past the target or the deepest reading, on round steps. */
function domainFor(trace: TracePoint[], target: number, exercise: Exercise): Domain {
  let low = exercise.rest
  let high = target
  for (const p of trace) {
    low = Math.min(low, p.angle)
    high = Math.max(high, p.angle)
  }
  const step = high - low > 90 ? 30 : high - low > 50 ? 20 : 10
  const floor = Math.floor(Math.min(exercise.min, exercise.rest) / step) * step
  return { lo: Math.max(floor, Math.floor((low - 3) / step) * step), hi: Math.ceil((high + 6) / step) * step, step }
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** The whole session's curve, with the target, each rep's peak, any stalls, and the playhead. */
function TraceChart({
  trace,
  reps,
  target,
  domain,
  duration,
  deepestAt,
  at,
  angle,
  started,
  current,
  onScrub,
  onToggle,
}: {
  trace: TracePoint[]
  reps: Rep[]
  target: number
  domain: Domain
  duration: number
  deepestAt: number
  at: number
  angle: number | null
  started: boolean
  current: Rep | undefined
  onScrub: (t: number) => void
  onToggle: () => void
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [box, width] = useWidth()
  const { lo, hi, step } = domain
  const plotW = Math.max(1, width - PAD.left - PAD.right)
  const plotH = CHART_H - PAD.top - PAD.bottom
  const bottom = PAD.top + plotH
  const x = (t: number) => PAD.left + (t / (duration || 1)) * plotW
  const y = (a: number) => PAD.top + (1 - (Math.min(hi, Math.max(lo, a)) - lo) / (hi - lo)) * plotH

  const paths = useMemo(() => {
    const sx = (t: number) => (PAD.left + (t / (duration || 1)) * plotW).toFixed(1)
    const sy = (a: number) => (PAD.top + (1 - (Math.min(hi, Math.max(lo, a)) - lo) / (hi - lo)) * plotH).toFixed(1)
    const draw = (points: TracePoint[]) => points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.t)} ${sy(p.angle)}`).join('')
    // A gap in tracking breaks the line instead of bridging it.
    const runs: TracePoint[][] = [[]]
    trace.forEach((p, i) => {
      if (i && p.t - trace[i - 1].t > GAP_MS) runs.push([])
      runs[runs.length - 1].push(p)
    })
    const drawn = runs.filter((r) => r.length > 1)
    return {
      line: drawn.map(draw).join(''),
      area: drawn.map((r) => `${draw(r)}L${sx(r[r.length - 1].t)} ${bottom}L${sx(r[0].t)} ${bottom}Z`).join(''),
      stalls: reps
        .filter((r) => r.pause)
        .map((r) => draw(trace.filter((p) => p.t >= r.pause!.t && p.t <= r.pause!.t + r.pause!.ms)))
        .join(''),
    }
  }, [trace, reps, plotW, plotH, bottom, lo, hi, duration])

  const ticks: number[] = []
  for (let v = lo; v <= hi; v += step) ticks.push(v)
  const every = [5, 10, 15, 30, 60, 120].find((s) => duration / 1000 / s <= 7) ?? 300
  const times: number[] = []
  for (let s = 0; s * 1000 <= duration; s += every) times.push(s)

  // Until the replay starts, the whole curve is drawn as "played".
  const split = started ? x(at) : PAD.left + plotW
  const head = x(at)
  // The target's label takes the half of the chart the "deepest" callout doesn't.
  const targetRight = x(deepestAt) < PAD.left + plotW / 2
  const toT = (clientX: number) => ((clientX - box.current!.getBoundingClientRect().left - PAD.left) / plotW) * duration

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    onScrub(toT(e.clientX))
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) onScrub(toT(e.clientX))
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const by = e.shiftKey ? 5000 : 1000
    const moves: Record<string, number> = {
      ArrowRight: at + by,
      ArrowUp: at + by,
      ArrowLeft: at - by,
      ArrowDown: at - by,
      PageUp: at + 10_000,
      PageDown: at - 10_000,
      Home: 0,
      End: duration,
    }
    if (e.key in moves) onScrub(moves[e.key])
    else if (e.key === ' ') onToggle()
    else return
    e.preventDefault()
  }

  return (
    <div
      ref={box}
      role="slider"
      tabIndex={0}
      aria-label="Position in session"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration / 1000)}
      aria-valuenow={Math.floor(at / 1000)}
      aria-valuetext={`${formatDuration(Math.floor(at / 1000))}, ${angle == null ? 'not tracked' : `${Math.round(angle)}°`}${current ? `, rep ${current.n}` : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={onKeyDown}
      className="cursor-ew-resize touch-pan-y select-none rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-ink"
      style={{ height: CHART_H }}
    >
      {width > 0 && (
        <svg width={width} height={CHART_H} className="block overflow-visible" aria-hidden="true">
          <defs>
            <clipPath id={`played-${uid}`}>
              <rect x={0} y={0} width={split} height={CHART_H} />
            </clipPath>
            <clipPath id={`ahead-${uid}`}>
              <rect x={split} y={0} width={Math.max(0, width - split)} height={CHART_H} />
            </clipPath>
          </defs>

          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={y(v)} y2={y(v)} className={v === lo ? 'stroke-line-strong' : 'stroke-line'} strokeWidth="1" />
              <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted font-mono text-[10.5px]">
                {v}°
              </text>
            </g>
          ))}
          {times.map((s) => (
            <text key={s} x={x(s * 1000)} y={bottom + 18} textAnchor={s === 0 ? 'start' : 'middle'} className="fill-muted font-mono text-[10.5px]">
              {formatDuration(s)}
            </text>
          ))}

          {current && <rect x={x(current.start)} y={PAD.top} width={Math.max(1, x(current.end) - x(current.start))} height={plotH} className="fill-brand" fillOpacity="0.08" />}

          <line x1={PAD.left} x2={PAD.left + plotW} y1={y(target)} y2={y(target)} className="stroke-ink-2" strokeOpacity="0.55" strokeDasharray="4 5" strokeWidth="1" />
          <text
            x={targetRight ? PAD.left + plotW : PAD.left + 6}
            y={y(target) - 6}
            textAnchor={targetRight ? 'end' : 'start'}
            className="fill-ink-2 font-mono text-[10px] uppercase tracking-[0.06em]"
          >
            Target {target}°
          </text>

          <path d={paths.area} className="fill-brand" fillOpacity="0.13" clipPath={`url(#played-${uid})`} />
          <path d={paths.line} fill="none" className="stroke-line-strong" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#ahead-${uid})`} />
          <path d={paths.line} fill="none" className="stroke-brand-ink" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#played-${uid})`} />
          {paths.stalls && <path d={paths.stalls} fill="none" className="stroke-warn" strokeWidth="5" strokeOpacity="0.75" strokeLinecap="round" strokeLinejoin="round" />}

          {reps.map((r) => {
            const hit = r.peak >= target - REACHED_WITHIN
            const on = current?.n === r.n
            return (
              <circle
                key={r.n}
                cx={x(r.peakT)}
                cy={y(r.peak)}
                r={on ? 5 : 3.5}
                className={hit ? 'fill-brand-ink stroke-surface' : 'fill-surface stroke-brand-ink'}
                strokeWidth={hit ? 2 : 1.75}
              />
            )
          })}

          <line x1={head} x2={head} y1={PAD.top - 6} y2={bottom} className="stroke-ink" strokeWidth="1.5" />
          {angle != null && <circle cx={head} cy={y(angle)} r="5.5" className="fill-brand-ink stroke-surface" strokeWidth="2.5" />}
          {!started && angle != null && (
            <text
              x={head + (head > PAD.left + plotW - 110 ? -10 : 10)}
              y={y(angle) - 10}
              textAnchor={head > PAD.left + plotW - 110 ? 'end' : 'start'}
              className="fill-ink font-mono text-[10.5px] font-medium uppercase tracking-[0.06em]"
            >
              Deepest {Math.round(angle)}°
            </text>
          )}
        </svg>
      )}
    </div>
  )
}

/** Each rep's peak as a bar against the target; pick one to play it. */
function RepStrip({
  reps,
  target,
  domain,
  current,
  onPick,
}: {
  reps: Rep[]
  target: number
  domain: Domain
  current: number | undefined
  onPick: (rep: Rep) => void
}) {
  const share = (a: number) => Math.max(3, ((Math.min(domain.hi, a) - domain.lo) / (domain.hi - domain.lo)) * 100)
  const pct = (a: number) => `${share(a)}%`
  const labelled = reps.length <= 15
  return (
    <section>
      <h4 className="label-mono text-muted">Rep by rep</h4>
      <p className="mt-1 text-sm text-ink-2">Peak of each rep against the {target}° target. Pick one to play it.</p>
      {reps.length === 0 ? (
        <p className="mt-4 text-muted">No complete reps.</p>
      ) : (
        <div className="mt-4 flex gap-1.5">
          {reps.map((r) => {
            const hit = r.peak >= target - REACHED_WITHIN
            return (
              <button
                key={r.n}
                onClick={() => onPick(r)}
                aria-label={`Rep ${r.n}: ${r.peak}°${r.pause ? `, stalled at ${r.pause.angle}°` : ''}. Play from here.`}
                className="group min-w-0 flex-1 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink"
              >
                <span className="relative block h-20">
                  <span aria-hidden="true" className="absolute inset-x-[-3px] border-t border-dashed border-ink-2/50" style={{ bottom: pct(target) }} />
                  <span
                    className={`absolute inset-x-0 bottom-0 rounded-t-[5px] transition-[background-color,box-shadow] ${hit ? 'bg-brand' : 'bg-brand-track group-hover:bg-brand/50'} ${
                      current === r.n ? 'shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-ink)]' : ''
                    }`}
                    style={{ height: pct(r.peak) }}
                  />
                  {/* Inside the bar's top, so the target line above stays clear; a short bar carries it on top. */}
                  {labelled && (
                    <span
                      className={`absolute inset-x-0 text-center font-mono text-[10.5px] tabular-nums ${hit && share(r.peak) >= 25 ? 'text-on-brand' : 'text-ink-2'}`}
                      style={{ bottom: share(r.peak) >= 25 ? `calc(${pct(r.peak)} - 16px)` : `calc(${pct(r.peak)} + 3px)` }}
                    >
                      {r.peak}
                    </span>
                  )}
                </span>
                <span className={`mt-1.5 flex h-4 items-center justify-center gap-1 font-mono text-[10.5px] ${current === r.n ? 'font-bold text-ink' : 'text-muted'}`}>
                  {labelled && r.n}
                  {r.pause && <span className="size-1.5 shrink-0 rounded-full bg-warn" />}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Findings({ findings }: { findings: Finding[] }) {
  const dot = { good: 'bg-brand', neutral: 'bg-line-strong', warn: 'bg-warn' }
  return (
    <section>
      <h4 className="label-mono text-muted">What stands out</h4>
      <ul className="mt-3 space-y-3">
        {findings.map((f) => (
          <li key={f.text} className="flex gap-3 text-[15px] leading-snug">
            <span aria-hidden="true" className={`mt-[7px] size-2 shrink-0 rounded-full ${dot[f.tone]}`} />
            <span className={f.tone === 'warn' ? 'font-semibold text-ink' : 'text-ink-2'}>{f.text}</span>
          </li>
        ))}
      </ul>
      <p className="label-mono mt-5 text-[10px] text-muted">Measured from the session’s angle trace</p>
    </section>
  )
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 1.8v8.4a.6.6 0 0 0 .9.5l6.8-4.2a.6.6 0 0 0 0-1L3.9 1.3a.6.6 0 0 0-.9.5Z" fill="currentColor" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <rect x="2.2" y="1.5" width="2.6" height="9" rx="0.6" fill="currentColor" />
      <rect x="7.2" y="1.5" width="2.6" height="9" rx="0.6" fill="currentColor" />
    </svg>
  )
}

function ReplayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 8A5.5 5.5 0 1 0 4.1 4.1M2.5 2.5v3h3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

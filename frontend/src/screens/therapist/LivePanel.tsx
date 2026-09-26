import { useEffect, useMemo, useRef, useState } from 'react'
import { AngleTrace } from '../../components/AngleTrace'
import { ExerciseFigure } from '../../components/ExerciseFigure'
import { exerciseFor } from '../../lib/exercises'
import { formatDuration } from '../../lib/format'
import { REACHED_WITHIN, angleAt, type TracePoint } from '../../lib/replay'
import type { LiveSession } from '../../lib/useLiveSessions'
import { useReducedMotion } from '../../lib/useReducedMotion'
import type { LiveEndReason } from '../../types/live'

// A patient's session while it happens, from the angles their screen streams
// (no video): the figure moves with them, beside the reps, the target, a
// rolling trace and the latest form cue. Batches arrive every ~250 ms, so the
// panel plays them back DELAY_MS behind, easing between samples, and the
// figure moves smoothly instead of jumping four times a second.

const DELAY_MS = 400

const ENDED_TITLE: Record<LiveEndReason, string> = {
  finished: 'Session finished',
  exited: 'Left the session',
  pain: 'Stopped: reported pain',
  lost: 'Connection lost',
}

export function LivePanel({ live, name }: { live: LiveSession; name: string }) {
  const exercise = exerciseFor(live.joint)
  const { head, elapsed } = usePlayhead(live)
  const trace = useMemo<TracePoint[]>(() => live.samples.map((p) => ({ t: p.t_ms, angle: p.angle })), [live.samples])
  const angle = angleAt(trace, head)
  const reached = angle != null && angle >= live.target - REACHED_WITHIN
  const best = Math.round(live.max_angle)
  const first = name.split(' ')[0]
  // The trace runs up to the playhead, so it scrolls in step with the figure.
  const shown = live.samples.filter((p) => p.t_ms <= head)
  if (angle != null) shown.push({ t_ms: head, angle })

  const endedNote = {
    finished: `${live.reps}/${live.goal} reps · saved to Sessions below`,
    exited: `${first} stopped after ${live.reps}/${live.goal} reps`,
    pain: `${first} said it hurt after ${live.reps}/${live.goal} reps · saved to Sessions below`,
    lost: `Stopped hearing from ${first}’s device`,
  }

  return (
    <div
      className={`overflow-hidden rounded-3xl bg-surface ring-1 transition-shadow ${
        live.ended === 'pain' ? 'ring-critical/60' : live.ended ? 'ring-line' : 'shadow-lift ring-brand/50'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 pb-4 pt-6 sm:px-7">
        <h3 aria-live="polite" className={`flex items-center gap-2.5 text-lg font-bold ${live.ended === 'pain' ? 'text-critical' : ''}`}>
          <LiveDot ended={live.ended != null} />
          {live.ended ? ENDED_TITLE[live.ended] : 'Live now'}
        </h3>
        <p className="text-sm text-muted">{live.ended ? endedNote[live.ended] : `${exercise.copy.en.name} · angles only, no video`}</p>
      </div>

      <div className="grid gap-5 px-6 pb-7 sm:px-7 md:grid-cols-2">
        <div className="relative h-56 overflow-hidden rounded-2xl bg-stage text-white sm:h-64 md:h-auto md:min-h-64">
          <ExerciseFigure exercise={exercise} angle={angle} target={live.target} showLabel={false} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />
          <p className="label-mono absolute left-4 top-4 text-white/60">{exercise.copy.en.angleLabel}</p>
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
            <span className="label-mono block text-white/60">Reps</span>
            <span className="mt-1 block text-2xl font-bold tabular-nums">
              {live.reps}
              <span className="text-base font-medium text-white/45"> / {live.goal}</span>
            </span>
          </p>
        </div>

        <div className="min-w-0">
          <dl className="grid grid-cols-3 overflow-hidden rounded-2xl ring-1 ring-line [&>div+div]:border-l [&>div]:border-line">
            <Mini label="Time" value={formatDuration(Math.floor(elapsed / 1000))} />
            <Mini label="Target" value={`${live.target}°`} />
            <Mini label="Best" value={best > 0 ? `${best}°` : '—'} accent={best >= live.target - REACHED_WITHIN} />
          </dl>
          <div className="mt-3 flex gap-1" aria-hidden="true">
            {Array.from({ length: live.goal }, (_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i < live.reps ? 'bg-brand' : 'bg-brand-track'}`} />
            ))}
          </div>

          <p className="label-mono mt-5 text-muted">Last 12 seconds</p>
          <div className="mt-2">
            <AngleTrace samples={shown} target={live.target} min={exercise.min} />
          </div>

          <div className="mt-4 min-h-10" aria-live="polite">
            {live.warning && !live.ended ? (
              <p className="flex items-center gap-2 rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm font-semibold text-warn">
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
                  <path d="M8 1.5 15 14H1L8 1.5Z" fill="currentColor" />
                  <path d="M8 6v3.5M8 11.5v.5" className="stroke-warn-soft" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                {live.warning}
              </p>
            ) : live.last_cue ? (
              <p className="py-2.5 text-sm text-ink-2">
                Last form cue <span className="font-semibold text-ink">{live.last_cue.text}</span> at {formatDuration(Math.floor(live.last_cue.t_ms / 1000))}
              </p>
            ) : (
              <p className="py-2.5 text-sm text-muted">No form cues so far.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Pulses while a session is live; a plain grey dot once it's over. */
export function LiveDot({ ended = false }: { ended?: boolean }) {
  return (
    <span className="relative flex size-2.5 shrink-0" aria-hidden="true">
      {!ended && <span className="absolute inset-0 animate-ping rounded-full bg-brand opacity-70" />}
      <span className={`relative size-2.5 rounded-full ${ended ? 'bg-line-strong' : 'bg-brand'}`} />
    </span>
  )
}

function Mini({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="px-4 py-3">
      <dt className="label-mono text-[10px] text-muted">{label}</dt>
      <dd className={`mt-1 text-xl font-bold tabular-nums ${accent ? 'text-brand-ink' : ''}`}>{value}</dd>
    </div>
  )
}

/**
 * Where playback is in session time, and the session clock. Each batch
 * refines how session time maps onto this clock, smoothed so a batch that's
 * a little late doesn't jolt the figure; the playhead never runs backwards
 * or past the latest sample. With reduced motion it sits on the latest sample.
 */
function usePlayhead(live: LiveSession) {
  const reduced = useReducedMotion()
  const latest = useRef(live)
  const clock = useRef({ startedAt: '', offset: 0, head: 0 })
  const [frame, setFrame] = useState({ head: 0, elapsed: live.t_ms })

  useEffect(() => {
    latest.current = live
    const offset = live.received_at - live.t_ms
    const c = clock.current
    if (c.startedAt !== live.started_at) clock.current = { startedAt: live.started_at, offset, head: 0 }
    else c.offset += (offset - c.offset) * 0.2
  }, [live])

  useEffect(() => {
    let raf = 0
    const tick = (now: number) => {
      const s = latest.current
      const c = clock.current
      const last = s.samples.at(-1)?.t_ms ?? 0
      c.head = reduced || s.ended ? last : Math.min(last, Math.max(c.head, now - c.offset - DELAY_MS))
      const elapsed = s.ended ? s.t_ms : Math.max(s.t_ms, now - c.offset)
      setFrame((f) => (f.head === c.head && Math.floor(f.elapsed / 1000) === Math.floor(elapsed / 1000) ? f : { head: c.head, elapsed }))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduced])

  return frame
}

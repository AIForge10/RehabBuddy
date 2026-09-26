// The therapist dashboard's view of who is exercising right now: one stream
// for the whole caseload (src/api/live.ts), folded into the latest state of
// each patient's live session.

import { useEffect, useRef, useState } from 'react'
import { watchLive } from '../api/live'
import type { LiveEndReason, LiveEvent } from '../types/live'
import type { AngleSample, UUID } from '../types/session'

/**
 * A patient silent this long is lost. The backend says so itself after 5 s;
 * this covers mock mode, which has no backend, and a dead stream.
 */
const STALE_MS = 6000
/** How long an ended session stays on the dashboard, saying how it ended. */
const LINGER_MS = 6000
/** A stop for pain stays up long enough that a therapist who looked away still sees it. */
const PAIN_LINGER_MS = 60_000
/** ~30 s at 10 Hz: the rolling trace shows the last 12. */
const KEEP_SAMPLES = 300

export interface LiveSession {
  patient_id: UUID
  started_at: string
  joint: string
  target: number
  goal: number
  reps: number
  max_angle: number
  /** The cue on the patient's screen right now. */
  warning: string | null
  /** The latest cue and when it showed (session time), so it outlasts its moment on screen. */
  last_cue: { text: string; t_ms: number } | null
  samples: AngleSample[]
  /** Session time of the latest batch, and when it arrived (performance.now()). */
  t_ms: number
  received_at: number
  ended: LiveEndReason | null
  ended_at: number
}

type Sessions = Record<UUID, LiveSession>

export function applyLiveEvent(sessions: Sessions, event: LiveEvent, now: number): Sessions {
  const current = sessions[event.patient_id]
  const same = current?.started_at === event.started_at
  if (event.type === 'end') {
    if (!same || current.ended) return sessions
    return { ...sessions, [event.patient_id]: { ...current, ended: event.reason, ended_at: now } }
  }
  // A batch still in flight after the end doesn't reopen it; a lost session whose patient comes back does.
  if (same && current.ended && current.ended !== 'lost') return sessions
  const fresh = same && !current.ended
  const lastT = fresh ? (current.samples.at(-1)?.t_ms ?? -1) : -1
  const samples = event.samples.filter((p) => p.t_ms > lastT) // a snapshot after a reconnect repeats some
  return {
    ...sessions,
    [event.patient_id]: {
      patient_id: event.patient_id,
      started_at: event.started_at,
      joint: event.joint,
      target: event.target,
      goal: event.goal,
      reps: event.reps,
      max_angle: event.max_angle,
      warning: event.warning,
      last_cue: event.warning ? { text: event.warning, t_ms: event.t_ms } : same ? current.last_cue : null,
      samples: fresh ? [...current.samples, ...samples].slice(-KEEP_SAMPLES) : samples,
      t_ms: event.t_ms,
      received_at: now,
      ended: null,
      ended_at: 0,
    },
  }
}

/**
 * Live sessions of these patients, by patient id. `onStart` fires when one
 * begins (or is already under way when the dashboard opens), `onEnd` when it
 * ends, however it ends.
 */
export function useLiveSessions(
  patientIds: UUID[],
  { onStart, onEnd }: { onStart: (patientId: UUID) => void; onEnd: (patientId: UUID, reason: LiveEndReason) => void },
): Sessions {
  const [sessions, setSessions] = useState<Sessions>({})
  const state = useRef<Sessions>({})
  const handlers = useRef({ onStart, onEnd })
  useEffect(() => {
    handlers.current = { onStart, onEnd }
  })

  // One stream for the whole list; reconnects only when the list changes.
  const key = [...new Set(patientIds)].sort().join(',')

  useEffect(() => {
    // Diffs old and new state, so each start and end is reported once, whether
    // the backend said so or the silence timer below decided it.
    const commit = (next: Sessions) => {
      const prev = state.current
      if (next === prev) return
      state.current = next
      setSessions(next)
      for (const [id, s] of Object.entries(next)) {
        const was = prev[id]
        const isNew = !was || was.started_at !== s.started_at || (was.ended != null && s.ended == null)
        if (isNew && !s.ended) handlers.current.onStart(id)
        if (s.ended && !was?.ended) handlers.current.onEnd(id, s.ended)
      }
    }

    const stop = key ? watchLive(key.split(','), (event) => commit(applyLiveEvent(state.current, event, performance.now()))) : () => {}

    const tick = setInterval(() => {
      const now = performance.now()
      const next: Sessions = {}
      let changed = false
      for (const [id, s] of Object.entries(state.current)) {
        if (s.ended && now - s.ended_at > (s.ended === 'pain' ? PAIN_LINGER_MS : LINGER_MS)) {
          changed = true
          continue
        }
        if (!s.ended && now - s.received_at > STALE_MS) {
          next[id] = { ...s, ended: 'lost', ended_at: now }
          changed = true
          continue
        }
        next[id] = s
      }
      if (changed) commit(next)
    }, 1000)

    return () => {
      stop()
      clearInterval(tick)
    }
  }, [key])

  return sessions
}

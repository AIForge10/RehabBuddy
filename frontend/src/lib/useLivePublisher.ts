// Streams the session screen to the therapist's dashboard while the patient
// exercises: every ~250 ms, the trace samples recorded since the last batch
// plus the reps, best angle and form cue. Angles only, never video.
//
// Best effort (see src/api/live.ts): it never blocks and never throws, so an
// unreachable backend can't slow the session down or break it.

import { useCallback, useEffect, useRef, useState } from 'react'
import { openLivePublisher, type LivePublisher, type PublishedEndReason } from '../api/live'
import type { AngleSample, UUID } from '../types/session'

const SEND_MS = 250
/** The backend takes at most this many samples a batch; after a stall only the latest go. */
const MAX_BATCH = 100

/** The session as it stands, read on every batch. */
export interface LiveReading {
  startedAt: Date
  elapsedMs: number
  /** The on-screen trace so far; each batch sends only what's new. */
  samples: AngleSample[]
  reps: number
  maxAngle: number
  warning: string | null
}

export function useLivePublisher({
  patientId,
  joint,
  target,
  goal,
  active,
  read,
}: {
  patientId: UUID
  joint: string
  target: number
  goal: number
  /** From the end of the countdown until the session is saved or left. Batches keep going while it saves. */
  active: boolean
  read: () => LiveReading
}) {
  const [connected, setConnected] = useState(false)
  const publisher = useRef<LivePublisher | null>(null)
  const latest = useRef({ read, joint, target, goal })
  useEffect(() => {
    latest.current = { read, joint, target, goal }
  })
  const sent = useRef(0)
  const started = useRef<string | null>(null)
  const ended = useRef<string | null>(null)

  /** Tells the dashboard the session is over, and why; only the first call for a session counts. */
  const end = useCallback(
    (reason: PublishedEndReason) => {
      const startedAt = started.current
      if (!startedAt || ended.current === startedAt) return
      ended.current = startedAt
      publisher.current?.send({ type: 'end', patient_id: patientId, started_at: startedAt, reason })
    },
    [patientId],
  )

  // Connect during the countdown so the first batch goes out at "go". Leaving
  // the screen any way at all (exit, back button) ends the live view.
  useEffect(() => {
    const p = openLivePublisher(patientId, setConnected)
    publisher.current = p
    return () => {
      end('exited')
      p.close()
      publisher.current = null
    }
  }, [patientId, end])

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => {
      const { read, joint, target, goal } = latest.current
      const r = read()
      const startedAt = r.startedAt.toISOString()
      if (ended.current === startedAt) return
      started.current = startedAt
      if (sent.current > r.samples.length) sent.current = 0
      const fresh = r.samples.slice(sent.current).slice(-MAX_BATCH)
      sent.current = r.samples.length
      // Empty batches still go: they tell the dashboard the patient is still there.
      publisher.current?.send({
        type: 'update',
        patient_id: patientId,
        started_at: startedAt,
        joint,
        target,
        goal,
        t_ms: Math.max(0, Math.round(r.elapsedMs)),
        reps: r.reps,
        max_angle: Math.round(r.maxAngle * 10) / 10,
        warning: r.warning?.slice(0, 120) ?? null,
        samples: fresh,
      })
    }, SEND_MS)
    return () => clearInterval(id)
  }, [active, patientId])

  return { connected, end }
}

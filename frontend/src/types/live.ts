// Live sessions: what a patient's session screen streams to their therapist
// while they exercise. Angles, reps and form cues only, never video.
// Field names match backend/api/data/live.py.

import type { AngleSample, ISODateString, UUID } from './session'

/**
 * Sent every ~250 ms while the session runs. It repeats the plan, so any one
 * batch describes the whole session: a therapist who tunes in mid-session
 * needs nothing earlier.
 */
export interface LiveUpdate {
  type: 'update'
  patient_id: UUID
  /** Identifies the session: the patient's session screen sets it when the countdown ends. */
  started_at: ISODateString
  /** 'knee', 'hip', … (lib/exercises.ts). */
  joint: string
  target: number
  /** Reps asked for. */
  goal: number
  /** Milliseconds since the session started, when this batch was sent. */
  t_ms: number
  reps: number
  /** Deepest angle so far this session. */
  max_angle: number
  /** The form cue showing on the patient's screen right now, if any. */
  warning: string | null
  /** The on-screen trace's samples since the last batch (a snapshot sends the last ~20 s). */
  samples: AngleSample[]
}

/** `lost`: the patient went quiet for a few seconds (tab closed, network gone). */
export type LiveEndReason = 'finished' | 'exited' | 'lost'

export interface LiveEnd {
  type: 'end'
  patient_id: UUID
  started_at: ISODateString
  reason: LiveEndReason
}

export type LiveEvent = LiveUpdate | LiveEnd

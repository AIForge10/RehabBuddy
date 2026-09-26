// Stand-in for src/pose/usePose until the real tracker is wired in, and the
// "camera fails on stage" fallback afterwards. Produces the same LivePoseState
// shape the real hook will: a smooth rep cycle for the exercise whose depth
// creeps up toward the target, with the occasional form cue.

import { useEffect, useRef, useState } from 'react'
import type { Exercise } from './exercises'
import type { LivePoseState } from '../types/session'

const REP_MS = 3200

/**
 * Rep thresholds as fractions of the way from the start angle to the target:
 * past BENT counts as "in the rep", back under STRAIGHT completes it. For the
 * knee's 0° → 90° that's 45° and 15°. The real rep counter should use the same.
 */
export const BENT = 0.5
export const STRAIGHT = 1 / 6

export function useSimulatedPose(running: boolean, exercise: Exercise, targetAngle: number): LivePoseState {
  const { rest, formWarning } = exercise
  const [state, setState] = useState<LivePoseState>({ angle: rest, reps: 0, form_warning: null, confidence: 0.95 })
  const ref = useRef({ reps: 0, bent: false, repIndex: -1, peak: 0, warnUntil: 0, warning: null as string | null })

  useEffect(() => {
    if (!running) return
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const r = ref.current
      const elapsed = now - t0
      const repIndex = Math.floor(elapsed / REP_MS)
      const span = targetAngle - rest
      if (repIndex !== r.repIndex) {
        r.repIndex = repIndex
        // Early reps fall short by a fifth of the range; later ones come within a degree.
        r.peak = Math.min(targetAngle - 1, targetAngle - span * (0.2 - Math.min(repIndex, 8) * 0.027 + (Math.random() - 0.5) * 0.067))
        if (Math.random() < 0.18) {
          r.warning = formWarning
          r.warnUntil = now + 1400
        }
      }
      const phase = (elapsed % REP_MS) / REP_MS
      const angle = Math.max(0, rest + ((r.peak - rest) * (1 - Math.cos(2 * Math.PI * phase))) / 2 + span * 0.03 + (Math.random() - 0.5) * 1.2)

      if (!r.bent && angle > rest + span * BENT) r.bent = true
      if (r.bent && angle < rest + span * STRAIGHT) {
        r.bent = false
        r.reps += 1
      }
      const warning = now < r.warnUntil && phase > 0.2 && phase < 0.7 ? r.warning : null
      setState({ angle, reps: r.reps, form_warning: warning, confidence: 0.95 })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, rest, formWarning, targetAngle])

  return state
}

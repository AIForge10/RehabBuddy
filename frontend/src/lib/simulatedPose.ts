// Stand-in for src/pose/usePose until the real tracker is wired in, and the
// "camera fails on stage" fallback afterwards. Produces the same LivePoseState
// shape the real hook will: a smooth knee-bend cycle whose depth creeps up
// toward the target, with the occasional form cue.

import { useEffect, useRef, useState } from 'react'
import type { LivePoseState } from '../types/session'

const REP_MS = 3200
const BENT = 45 // flexion that counts as "in the bend"
const STRAIGHT = 15 // flexion that counts as "back to straight"

export function useSimulatedPose(running: boolean, targetAngle: number): LivePoseState {
  const [state, setState] = useState<LivePoseState>({ angle: 4, reps: 0, form_warning: null, confidence: 0.95 })
  const ref = useRef({ reps: 0, bent: false, repIndex: -1, peak: 0, warnUntil: 0, warning: null as string | null })

  useEffect(() => {
    if (!running) return
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const r = ref.current
      const elapsed = now - t0
      const repIndex = Math.floor(elapsed / REP_MS)
      if (repIndex !== r.repIndex) {
        r.repIndex = repIndex
        // Early reps are shallow; later ones reach or pass the target.
        r.peak = Math.min(targetAngle - 1, targetAngle - 18 + Math.min(repIndex, 8) * 2.4 + (Math.random() - 0.5) * 6)
        if (Math.random() < 0.18) {
          r.warning = 'Knee caving inward'
          r.warnUntil = now + 1400
        }
      }
      const phase = (elapsed % REP_MS) / REP_MS
      const angle = Math.max(0, (r.peak * (1 - Math.cos(2 * Math.PI * phase))) / 2 + 3 + (Math.random() - 0.5) * 1.2)

      if (!r.bent && angle > BENT) r.bent = true
      if (r.bent && angle < STRAIGHT) {
        r.bent = false
        r.reps += 1
      }
      const warning = now < r.warnUntil && phase > 0.2 && phase < 0.7 ? r.warning : null
      setState({ angle, reps: r.reps, form_warning: warning, confidence: 0.95 })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, targetAngle])

  return state
}

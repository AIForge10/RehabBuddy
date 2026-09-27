// Native landmarks in, the same numbers the website reports out.
//
// Everything below the landmark source is the web app's own code, copied unchanged from
// frontend/src/pose/: jointAngle (measured on PIXELS, never on normalized values -- on a
// 16:9 frame a true 45° raise reads ~29° from normalized coordinates), LandmarkSmoother
// (One Euro, in units of the frame diagonal so beta means the same on any camera), and
// RepCounter with its hysteresis, glitch rejection and rest tracking. Keeping that shared
// is the point of the port: the phone and the browser must not disagree about a patient's
// range of motion.

import { useCallback, useRef, useState } from 'react'
import { jointAngle, toPixels } from './angle'
import { LandmarkSmoother } from './filters'
import { JOINTS, type JointConfig, type JointName } from './joints'
import { DEFAULT_TUNING, type NormalizedLandmark, type PoseFrame } from './landmarks'
import { RepCounter, type RepWarning } from './repCounter'

export interface PoseReading {
  /** Angle in the joint's convention (flexion: straight = 0), or null when the limb isn't visible. */
  angle: number | null
  reps: number
  maxAngle: number
  /** Warnings from the rep that just finished, if any. */
  warnings: RepWarning[]
  tracking: boolean
}

const EMPTY: PoseReading = { angle: null, reps: 0, maxAngle: 0, warnings: [], tracking: false }

export function useNativePose(joint: JointName, target: number) {
  const cfg = JOINTS[joint]
  const counter = useRef(
    new RepCounter({ targetAngle: target, bentThreshold: cfg.bent, straightThreshold: cfg.straight }),
  )
  const smoother = useRef(new LandmarkSmoother(DEFAULT_TUNING.lmMinCutoff, DEFAULT_TUNING.lmBeta))
  const [reading, setReading] = useState<PoseReading>(EMPTY)

  const onFrame = useCallback(
    (frame: PoseFrame) => {
      const { width, height, timestamp } = frame
      if (!frame.landmarks.length) {
        setReading((r) => ({ ...r, angle: null }))
        return
      }
      const lm = DEFAULT_TUNING.smoothLandmarks
        ? smoother.current.apply(frame.landmarks, width, height, timestamp, DEFAULT_TUNING.minVisibility)
        : frame.landmarks

      const side = pickSide(lm, cfg)
      if (!side) {
        setReading((r) => ({ ...r, angle: null }))
        return
      }
      const [ai, ji, bi] = side
      const angle = jointAngle(
        cfg,
        toPixels(lm[ai], width, height),
        toPixels(lm[ji], width, height),
        toPixels(lm[bi], width, height),
      )

      const event = counter.current.update(angle, timestamp)
      setReading({
        angle,
        reps: counter.current.count,
        maxAngle: counter.current.maxAngle,
        warnings: event.type === 'rep' ? event.warnings : [],
        tracking: true,
      })
    },
    [cfg],
  )

  const reset = useCallback(() => {
    counter.current.reset()
    smoother.current.reset()
    setReading(EMPTY)
  }, [])

  return { reading, onFrame, reset }
}

/** The left/right triple whose three points are all visible enough; prefers the better side. */
function pickSide(lm: NormalizedLandmark[], cfg: JointConfig): [number, number, number] | null {
  let best: [number, number, number] | null = null
  let bestScore = 0
  for (const s of [0, 1]) {
    const trio: [number, number, number] = [cfg.a[s], cfg.joint[s], cfg.b[s]]
    const marks = trio.map((i) => lm[i])
    if (marks.some((m) => m == null)) continue
    const score = Math.min(...marks.map((m) => m.visibility))
    if (score >= DEFAULT_TUNING.minVisibility && score > bestScore) {
      best = trio
      bestScore = score
    }
  }
  return best
}

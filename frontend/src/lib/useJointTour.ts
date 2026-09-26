import { useEffect, useRef, useState } from 'react'
import { EXERCISES, type BodyPart, type Exercise } from './exercises'
import { useDemoLoop } from './useDemoLoop'

// The signed-out pages' demo: one perfect rep per joint, legs and arms taking
// turns, so a visitor sees every joint we coach without touching anything.

/** Legs and arms take turns. */
const TOUR: readonly BodyPart[] = ['knee', 'shoulder', 'hip', 'elbow', 'wrist']
const REPS = 10

/** From the exercise's start angle toward its target by `share` of the way. */
export const toward = (ex: Exercise, share: number) => Math.round(ex.rest + share * (ex.target - ex.rest))

export function useJointTour(running = true) {
  const [part, setPart] = useState<BodyPart>(TOUR[0])
  const exercise = EXERCISES[part]
  const demo = useDemoLoop(exercise.rest, exercise.target, running)

  // A rep lands when the return phase hands back to the start; the tour moves on with it.
  const [reps, setReps] = useState(3)
  const prev = useRef(demo.phase)
  useEffect(() => {
    if (prev.current === 3 && demo.phase === 0) {
      setReps((r) => (r >= REPS ? 1 : r + 1))
      setPart((p) => TOUR[(TOUR.indexOf(p) + 1) % TOUR.length])
    }
    prev.current = demo.phase
  }, [demo.phase])

  return { part, exercise, demo, reps, totalReps: REPS }
}

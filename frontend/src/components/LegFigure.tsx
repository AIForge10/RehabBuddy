// The knee exercise on the stage: ExerciseFigure with the knee's pose and
// framing, for screens that only ever show the knee.

import { EXERCISES } from '../lib/exercises'
import { ExerciseFigure } from './ExerciseFigure'

export function LegFigure({
  angle,
  target,
  showLabel = true,
  tracking = true,
}: {
  angle: number | null
  target: number
  showLabel?: boolean
  /** Draw the tracked skeleton over the body; off for the plain demo. */
  tracking?: boolean
}) {
  return <ExerciseFigure exercise={EXERCISES.knee} angle={angle} target={target} showLabel={showLabel} tracking={tracking} />
}

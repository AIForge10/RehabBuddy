import { useId } from 'react'
import { ARM_PATH, LEG_PATH } from './Logo'

/** One pattern cell, stage units. The leg is drawn at 0.8 (73 × 119) and the arm at 0.11 (134 × 72). */
const W = 144
const H = 140
const LEG = (x: number, y: number) => `translate(${x + (W - 73) / 2} ${y + (H - 119) / 2}) scale(0.8)`
const ARM = (x: number, y: number) => `translate(${x + (W - 134) / 2} ${y + (H - 72) / 2}) scale(0.11)`

/**
 * The cover-art motif for dark brand cards: legs and arms in a checkerboard on
 * an 8° tilt, every joint we coach, faded out by `mask` (a CSS mask-image
 * utility) so copy stays clean.
 */
export function LimbLattice({ mask = '[mask-image:radial-gradient(ellipse_60%_90%_at_100%_20%,black_30%,transparent_78%)]', opacity = 0.55 }: { mask?: string; opacity?: number }) {
  const id = useId()
  return (
    <svg aria-hidden="true" className={`pointer-events-none absolute inset-0 -z-10 h-full w-full text-brand ${mask}`}>
      <defs>
        <pattern id={id} width={W * 2} height={H * 2} patternUnits="userSpaceOnUse" patternTransform="rotate(8) translate(24 -18)">
          <g fill="currentColor">
            <path d={LEG_PATH} transform={LEG(0, 0)} />
            <path d={ARM_PATH} transform={ARM(W, 0)} />
            <path d={ARM_PATH} transform={ARM(0, H)} />
            <path d={LEG_PATH} transform={LEG(W, H)} />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} opacity={opacity} />
    </svg>
  )
}

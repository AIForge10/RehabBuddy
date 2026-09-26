import { useId } from 'react'
import { LEG_PATH } from './Logo'

/**
 * The cover-art motif for dark brand cards: rows of legs on an 8° tilt,
 * faded out by `mask` (a CSS mask-image utility) so copy stays clean.
 */
export function LegLattice({ mask = '[mask-image:radial-gradient(ellipse_60%_90%_at_100%_20%,black_30%,transparent_78%)]', opacity = 0.55 }: { mask?: string; opacity?: number }) {
  const id = useId()
  return (
    <svg aria-hidden="true" className={`pointer-events-none absolute inset-0 -z-10 h-full w-full text-brand ${mask}`}>
      <defs>
        <pattern id={id} width="124" height="148" patternUnits="userSpaceOnUse" patternTransform="rotate(8) translate(24 -18)">
          <path d={LEG_PATH} transform="translate(22 10) scale(0.8)" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} opacity={opacity} />
    </svg>
  )
}

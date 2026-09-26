import type { ReactNode } from 'react'

// Instrument dial from `min` (the joint's start) to `max`, filled to the
// current reading, with a notch at the prescribed target. Children render centered.

const CX = 120
const CY = 124
const R = 100
const STROKE = 14

/** Dial geometry for a range: angle → point on the arc, and arcs between readings. */
function dial(min: number, max: number) {
  const point = (deg: number, r = R) => {
    const a = Math.PI - ((Math.min(Math.max(deg, min), max) - min) / (max - min)) * Math.PI
    return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) }
  }
  const arc = (from: number, to: number) => {
    const a = point(from)
    const b = point(to)
    return `M ${a.x} ${a.y} A ${R} ${R} 0 0 1 ${b.x} ${b.y}`
  }
  return { point, arc }
}

export function AngleGauge({
  angle,
  target,
  min = 0,
  max = 120,
  name = 'Knee flexion',
  children,
  onDark = false,
}: {
  angle: number | null
  target: number
  min?: number
  max?: number
  /** What the dial measures, for screen readers. */
  name?: string
  children?: ReactNode
  onDark?: boolean
}) {
  const { point, arc } = dial(min, max)
  const value = Math.max(min, angle ?? min)
  const reached = value >= target - 2
  const n1 = point(target, R - STROKE / 2 - 5)
  const n2 = point(target, R + STROKE / 2 + 5)
  const label = point(target, R + 24)
  const tip = point(value)
  return (
    <div className="relative">
      <svg viewBox="0 0 240 140" className="w-full overflow-visible" role="img" aria-label={`${name} ${Math.round(value)} degrees, target ${target}`}>
        <path d={arc(min, max)} fill="none" className={onDark ? 'stroke-white/12' : 'stroke-brand-track'} strokeWidth={STROKE} strokeLinecap="round" />
        <path d={arc(target, max)} fill="none" className={onDark ? 'stroke-brand-glow/20' : 'stroke-brand/15'} strokeWidth={STROKE} strokeLinecap="round" />
        {value > min + 0.5 && (
          <path d={arc(min, value)} fill="none" className={onDark ? 'stroke-brand-glow' : 'stroke-brand'} strokeWidth={STROKE} strokeLinecap="round" />
        )}
        {value > min + 0.5 && <circle cx={tip.x} cy={tip.y} r={STROKE / 2 - 3} className={onDark ? 'fill-white' : 'fill-on-brand'} />}
        <line x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y} className={onDark ? 'stroke-white' : 'stroke-ink'} strokeWidth={2.5} strokeLinecap="round" />
        <text x={label.x + 4} y={label.y} textAnchor="start" dominantBaseline="middle" className={`text-[11px] font-semibold ${reached ? (onDark ? 'fill-brand-glow' : 'fill-brand') : onDark ? 'fill-white/70' : 'fill-ink-2'}`}>
          {target}°
        </text>
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">{children}</div>
    </div>
  )
}

import type { ReactNode } from 'react'

// Instrument dial from 0° (straight leg) to MAX°, filled to the current
// flexion, with a notch at the prescribed target. Children render centered.

const MAX = 120
const CX = 120
const CY = 124
const R = 100
const STROKE = 14

function point(deg: number, r = R) {
  const a = Math.PI - (Math.min(Math.max(deg, 0), MAX) / MAX) * Math.PI
  return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) }
}

function arc(from: number, to: number) {
  const a = point(from)
  const b = point(to)
  const large = ((to - from) / MAX) * 180 > 180 ? 1 : 0
  return `M ${a.x} ${a.y} A ${R} ${R} 0 ${large} 1 ${b.x} ${b.y}`
}

export function AngleGauge({
  angle,
  target,
  children,
  onDark = false,
}: {
  angle: number | null
  target: number
  children?: ReactNode
  onDark?: boolean
}) {
  const value = Math.max(0, angle ?? 0)
  const reached = value >= target - 2
  const n1 = point(target, R - STROKE / 2 - 5)
  const n2 = point(target, R + STROKE / 2 + 5)
  const label = point(target, R + 24)
  const tip = point(value)
  return (
    <div className="relative">
      <svg viewBox="0 0 240 140" className="w-full overflow-visible" role="img" aria-label={`Knee flexion ${Math.round(value)} degrees, target ${target}`}>
        <path d={arc(0, MAX)} fill="none" className={onDark ? 'stroke-white/12' : 'stroke-brand-track'} strokeWidth={STROKE} strokeLinecap="round" />
        <path d={arc(target, MAX)} fill="none" className={onDark ? 'stroke-brand-glow/20' : 'stroke-brand/15'} strokeWidth={STROKE} strokeLinecap="round" />
        {value > 0.5 && (
          <path d={arc(0, value)} fill="none" className={onDark ? 'stroke-brand-glow' : 'stroke-brand'} strokeWidth={STROKE} strokeLinecap="round" />
        )}
        {value > 0.5 && <circle cx={tip.x} cy={tip.y} r={STROKE / 2 - 3} className={onDark ? 'fill-white' : 'fill-on-brand'} />}
        <line x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y} className={onDark ? 'stroke-white' : 'stroke-ink'} strokeWidth={2.5} strokeLinecap="round" />
        <text x={label.x + 4} y={label.y} textAnchor="start" dominantBaseline="middle" className={`text-[11px] font-semibold ${reached ? (onDark ? 'fill-brand-glow' : 'fill-brand') : onDark ? 'fill-white/70' : 'fill-ink-2'}`}>
          {target}°
        </text>
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">{children}</div>
    </div>
  )
}

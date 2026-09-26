// Half-dial from 0° (straight leg) to MAX°, filled to the current flexion,
// with a tick at the prescribed target.

const MAX = 120
const R = 88
const CX = 100
const CY = 100
const STROKE = 10

function point(deg: number, r = R) {
  // 0° sits at the left end of the arc, MAX at the right.
  const a = Math.PI - (Math.min(Math.max(deg, 0), MAX) / MAX) * Math.PI
  return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) }
}

function arc(from: number, to: number) {
  const a = point(from)
  const b = point(to)
  return `M ${a.x} ${a.y} A ${R} ${R} 0 0 1 ${b.x} ${b.y}`
}

export function AngleGauge({ angle, target }: { angle: number | null; target: number }) {
  const value = angle ?? 0
  const reached = value >= target - 2
  const t1 = point(target, R - 14)
  const t2 = point(target, R + 14)
  const label = point(target, R + 26)
  return (
    <svg viewBox="0 0 200 118" className="w-full" role="img" aria-label={`Knee flexion ${Math.round(value)} degrees, target ${target}`}>
      <path d={arc(0, MAX)} fill="none" className="stroke-line" strokeWidth={STROKE} strokeLinecap="round" />
      {value > 0.5 && (
        <path
          d={arc(0, value)}
          fill="none"
          className={reached ? 'stroke-accent' : 'stroke-ink-2'}
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
      )}
      <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} className="stroke-ink" strokeWidth={2} strokeLinecap="round" />
      <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" className="fill-muted text-[9px] font-medium">
        {target}°
      </text>
    </svg>
  )
}

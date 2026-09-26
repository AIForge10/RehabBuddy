// Tiny trend of recent session peaks (oldest → newest) with the target as a
// dashed rule. Decorative: callers state the numbers in text alongside it.

const W = 160
const H = 48
const PAD = 5

export function Sparkline({ values, target, className = '' }: { values: number[]; target: number; className?: string }) {
  if (values.length < 2) return null
  const lo = Math.min(target, ...values) - 6
  const hi = Math.max(target, ...values) + 3
  const x = (i: number) => PAD + (i / (values.length - 1)) * (W - 2 * PAD)
  const y = (v: number) => H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD)
  const line = values.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const last = values.length - 1

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`h-auto overflow-visible ${className}`} aria-hidden="true">
      <line x1={0} x2={W} y1={y(target)} y2={y(target)} className="stroke-ink-2" strokeOpacity={0.45} strokeWidth={1} strokeDasharray="3 4" />
      <path d={`${line} L ${x(last)} ${H} L ${x(0)} ${H} Z`} className="fill-brand" fillOpacity={0.12} />
      <path d={line} fill="none" className="stroke-brand" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last)} cy={y(values[last])} r={4.5} className="fill-brand stroke-surface" strokeWidth={2.5} />
    </svg>
  )
}

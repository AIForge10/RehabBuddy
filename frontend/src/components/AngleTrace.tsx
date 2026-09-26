import type { AngleSample } from '../types/session'

// Rolling trace of the last WINDOW_MS of flexion, with the target line.
const WINDOW_MS = 12_000
const W = 300
const H = 72

export function AngleTrace({ samples, target, onDark = false }: { samples: AngleSample[]; target: number; onDark?: boolean }) {
  const top = target + 20
  const now = samples.at(-1)?.t_ms ?? 0
  const visible = samples.filter((p) => p.t_ms >= now - WINDOW_MS)
  const x = (t: number) => W - ((now - t) / WINDOW_MS) * W
  const y = (a: number) => H - (Math.min(a, top) / top) * (H - 4) - 2
  const line = visible.map((p, i) => `${i ? 'L' : 'M'} ${x(p.t_ms).toFixed(1)} ${y(p.angle).toFixed(1)}`).join(' ')
  const area = visible.length > 1 ? `${line} L ${x(visible.at(-1)!.t_ms)} ${H} L ${x(visible[0].t_ms)} ${H} Z` : ''
  const last = visible.at(-1)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" aria-hidden="true">
      <line x1="0" x2={W} y1={y(target)} y2={y(target)} className={onDark ? 'stroke-white' : 'stroke-ink-2'} strokeOpacity={onDark ? 0.35 : 0.5} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <line x1="0" x2={W} y1={H} y2={H} className={onDark ? 'stroke-white/15' : 'stroke-line'} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {area && <path d={area} className={onDark ? 'fill-brand-glow' : 'fill-brand'} fillOpacity="0.14" />}
      {line && <path d={line} fill="none" className={onDark ? 'stroke-brand-glow' : 'stroke-brand'} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      {last && <circle cx={x(last.t_ms)} cy={y(last.angle)} r="4" className={onDark ? 'fill-brand-glow stroke-stage' : 'fill-brand stroke-surface'} strokeWidth="2" />}
    </svg>
  )
}

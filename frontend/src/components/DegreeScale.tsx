// The gauge unrolled into a ruler: ticks across the joint's range, the
// reading as a filled track with a marker, and a notch at the target. It's
// the app's signature, used wherever a bend is compared with its goal (the
// splash stage, the recap, the session summary), so "how far, how close"
// always reads the same way. Decorative: callers state the numbers in text.

const pct = (v: number, min: number, max: number) => `${(Math.min(Math.max(v, min), max) - min) / (max - min) * 100}%`

/** Labelled steps: about five across the range, on round numbers. */
function steps(min: number, max: number) {
  const major = [10, 15, 30, 45].find((s) => (max - min) / s <= 6) ?? 45
  const minor = major >= 30 ? 5 : major / 5
  const ticks: { v: number; major: boolean }[] = []
  for (let v = Math.ceil(min / minor) * minor; v <= max; v += minor) ticks.push({ v, major: v % major === 0 })
  return ticks
}

export function DegreeScale({
  value,
  target,
  min = 0,
  max = 120,
  onDark = false,
  labels = true,
  className = '',
}: {
  value: number | null
  target: number
  min?: number
  max?: number
  onDark?: boolean
  /** The degree numbers under the ticks. */
  labels?: boolean
  className?: string
}) {
  const ticks = steps(min, max)
  const v = value ?? min
  const reached = value != null && value >= target - 2
  const at = (d: number) => pct(d, min, max)
  // A major label that would crowd the target's own label steps aside.
  const near = (d: number) => d !== target && Math.abs(d - target) < (max - min) / 12
  const c = onDark
    ? { track: 'fill-white/12', fill: 'fill-brand-glow', tick: 'stroke-white/30', major: 'stroke-white/60', text: 'fill-white/55', target: 'stroke-white', targetText: 'fill-white', dot: 'fill-stage stroke-white', hit: 'fill-brand-glow stroke-stage' }
    : { track: 'fill-brand-track', fill: 'fill-brand', tick: 'stroke-line-strong', major: 'stroke-ink-2/60', text: 'fill-muted', target: 'stroke-ink', targetText: 'fill-ink', dot: 'fill-surface stroke-brand-ink', hit: 'fill-brand-ink stroke-surface' }

  return (
    <svg className={`block w-full overflow-visible ${labels ? 'h-9' : 'h-[22px]'} ${className}`} aria-hidden="true">
      <rect x="0" y="4" width="100%" height="5" rx="2.5" className={c.track} />
      {value != null && <rect x="0" y="4" width={at(v)} height="5" rx="2.5" className={c.fill} />}

      {ticks.map((t) => (
        <line key={t.v} x1={at(t.v)} x2={at(t.v)} y1="14" y2={t.major ? 21 : 18} className={t.major ? c.major : c.tick} strokeWidth="1" />
      ))}

      <line x1={at(target)} x2={at(target)} y1="0" y2="22" className={c.target} strokeWidth="2" strokeLinecap="round" />

      {value != null && <circle cx={at(v)} cy="6.5" r="4.5" strokeWidth="2.5" className={reached ? c.hit : c.dot} />}

      {labels &&
        ticks
          .filter((t) => t.major && !near(t.v) && t.v !== target)
          .map((t) => (
            <text
              key={t.v}
              x={at(t.v)}
              y="34"
              textAnchor={t.v === min ? 'start' : t.v === max ? 'end' : 'middle'}
              className={`font-mono text-[10px] ${c.text}`}
            >
              {t.v}°
            </text>
          ))}
      {labels && (
        <text x={at(target)} y="34" textAnchor={target >= max ? 'end' : target <= min ? 'start' : 'middle'} className={`font-mono text-[10px] font-semibold ${c.targetText}`}>
          {target}°
        </text>
      )}
    </svg>
  )
}

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

// Deepest bend per session, oldest → newest, against the target line. It
// doubles as the picker for the recap above it: hovering previews a session,
// a click or tap pins it, a sideways drag scrubs on touch, arrow keys step
// through as a slider. Vertical swipes are left to the page (touch-action:
// pan-y) so the chart never traps scrolling.

export interface TrendPoint {
  value: number
  /** Short date under the axis. */
  label: string
  /** What a screen reader hears for this point. */
  valueText: string
}

const PAD = { top: 34, right: 16, bottom: 26, left: 16 }
const STEP: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Monotone cubic through the points (d3's curveMonotoneX), so the curve never overshoots a session's value. */
function smooth(pts: { x: number; y: number }[]): string {
  const n = pts.length
  if (n < 3) return pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')
  const m = new Array<number>(n)
  for (let i = 1; i < n - 1; i++) {
    const h0 = pts[i].x - pts[i - 1].x
    const h1 = pts[i + 1].x - pts[i].x
    const s0 = (pts[i].y - pts[i - 1].y) / h0
    const s1 = (pts[i + 1].y - pts[i].y) / h1
    const p = (s0 * h1 + s1 * h0) / (h0 + h1)
    m[i] = (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0
  }
  const end = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ((3 * (b.y - a.y)) / (b.x - a.x) - t) / 2
  m[0] = end(pts[0], pts[1], m[1])
  m[n - 1] = end(pts[n - 2], pts[n - 1], m[n - 2])
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const dx = (b.x - a.x) / 3
    d += ` C ${a.x + dx} ${a.y + dx * m[i]} ${b.x - dx} ${b.y - dx * m[i + 1]} ${b.x} ${b.y}`
  }
  return d
}

export function TrendChart({
  points,
  target,
  targetLabel,
  active,
  engaged,
  onHover,
  onPick,
  label,
  className = '',
}: {
  points: TrendPoint[]
  target: number
  targetLabel: string
  /** Index of the session the recap is showing. */
  active: number
  /** True while a past session is previewed or pinned: shows the crosshair and value tag. */
  engaged: boolean
  onHover: (i: number | null) => void
  onPick: (i: number) => void
  label: string
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; x: number; y: number; scrubbing: boolean } | null>(null)
  const [{ w, h }, setSize] = useState({ w: 480, h: 176 })
  const wash = useId()

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ w: Math.round(width), h: Math.round(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const n = points.length
  const values = points.map((p) => p.value)
  const lo = Math.min(target, ...values) - 8
  const hi = Math.max(target, ...values) + 4
  const plotW = Math.max(1, w - PAD.left - PAD.right)
  const plotH = Math.max(1, h - PAD.top - PAD.bottom)
  const x = (i: number) => PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH
  const pts = values.map((v, i) => ({ x: x(i), y: y(v) }))
  const line = smooth(pts)
  const base = h - PAD.bottom
  const a = pts[active]
  const tagX = clamp(a.x, PAD.left + 22, w - PAD.right - 22)
  const tagY = a.y - 36 > 0 ? a.y - 20 : a.y + 20
  // The active session's date replaces an end label it would collide with.
  const showFirst = !engaged || a.x - pts[0].x > 56
  const showLast = !engaged || pts[n - 1].x - a.x > 56

  const indexAt = (clientX: number) => {
    const r = box.current!.getBoundingClientRect()
    return clamp(Math.round(((clientX - r.left - PAD.left) / plotW) * (n - 1)), 0, n - 1)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') {
      if (e.button === 0) onPick(indexAt(e.clientX))
      return
    }
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, scrubbing: false }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return onHover(indexAt(e.clientX))
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = Math.abs(e.clientX - d.x)
    if (!d.scrubbing && dx > 6 && dx > Math.abs(e.clientY - d.y)) {
      d.scrubbing = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    if (d.scrubbing) onHover(indexAt(e.clientX))
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (e.pointerType === 'mouse' || !d || d.id !== e.pointerId) return
    onPick(indexAt(e.clientX))
    onHover(null)
  }
  const onPointerCancel = () => {
    drag.current = null
    onHover(null)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = STEP[e.key]
    const next = step != null ? active + step : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null
    if (next == null) return
    e.preventDefault()
    onPick(clamp(next, 0, n - 1))
  }

  return (
    <div
      ref={box}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={n}
      aria-valuenow={active + 1}
      aria-valuetext={points[active].valueText}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={(e) => e.pointerType === 'mouse' && onHover(null)}
      onKeyDown={onKeyDown}
      className={`relative cursor-crosshair touch-pan-y select-none rounded-2xl ${className}`}
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id={wash} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--rb-brand)' }} stopOpacity="0.32" />
            <stop offset="1" style={{ stopColor: 'var(--rb-brand)' }} stopOpacity="0" />
          </linearGradient>
        </defs>

        <line x1={PAD.left} x2={w - PAD.right} y1={base} y2={base} className="stroke-line" />
        <line x1={PAD.left} x2={w - PAD.right} y1={y(target)} y2={y(target)} className="stroke-ink-2" strokeOpacity={0.45} strokeDasharray="4 5" />
        <text x={PAD.left} y={y(target) - 8} className="fill-ink-2 text-[11px] font-semibold">
          {targetLabel}
        </text>

        <path d={`${line} L ${pts[n - 1].x} ${base} L ${pts[0].x} ${base} Z`} fill={`url(#${wash})`} />
        <path
          d={line}
          fill="none"
          className="animate-draw stroke-brand-ink"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={100}
          strokeDasharray="100"
          style={{ ['--len' as string]: 100 }}
        />

        {engaged && <line x1={a.x} x2={a.x} y1={PAD.top - 10} y2={base} className="stroke-ink" strokeOpacity={0.2} />}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} className="fill-surface stroke-brand-ink" strokeWidth={2} />
        ))}
        <circle cx={a.x} cy={a.y} r={14} className="fill-brand" fillOpacity={0.22} />
        <circle cx={a.x} cy={a.y} r={7} className="fill-brand stroke-surface" strokeWidth={3} />

        {engaged && (
          <g transform={`translate(${tagX} ${tagY})`}>
            <rect x={-22} y={-12} width={44} height={24} rx={12} className="fill-ink" />
            <text textAnchor="middle" dominantBaseline="central" className="fill-surface text-[12px] font-bold">
              {values[active]}°
            </text>
          </g>
        )}

        {showFirst && (
          <text x={pts[0].x} y={h - 6} className="fill-muted text-[11px]">
            {points[0].label}
          </text>
        )}
        {showLast && n > 1 && (
          <text x={pts[n - 1].x} y={h - 6} textAnchor="end" className="fill-muted text-[11px]">
            {points[n - 1].label}
          </text>
        )}
        {engaged && (
          <text x={clamp(a.x, PAD.left + 24, w - PAD.right - 24)} y={h - 6} textAnchor="middle" className="fill-ink text-[11px] font-bold">
            {points[active].label}
          </text>
        )}
      </svg>
    </div>
  )
}

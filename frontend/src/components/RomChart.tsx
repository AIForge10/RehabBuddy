import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { shortDate } from '../lib/format'
import { useThemeColors } from '../lib/useThemeColors'
import type { SessionRecord } from '../types/session'

// Peak angle per session against the target, drawn like the home trend: an
// ink-teal line, hollow session dots with the latest filled, a dashed target
// and mono axis labels. Recharts gives the therapist its tooltip and axes.

const MONO = '"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace'

interface Point {
  label: string
  max_angle: number
  reps_done: number
  pain_score: number | null
  flagged: boolean
  started_at: string
  latest: boolean
}

interface DotProps {
  cx?: number
  cy?: number
  index?: number
  payload?: Point
}

function TooltipBox({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-xl bg-surface px-3 py-2.5 text-xs shadow-lift ring-1 ring-line">
      <p className="label-mono text-[10px] text-muted">
        {new Date(p.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
      </p>
      <p className="mt-1.5 tabular-nums text-ink-2">
        Peak <span className="font-bold text-ink">{p.max_angle}°</span> · {p.reps_done} reps
        {p.pain_score != null && <> · pain {p.pain_score}/10</>}
      </p>
      {p.flagged && <p className="mt-1 font-bold text-critical">Pain flag</p>}
    </div>
  )
}

export function RomChart({
  sessions,
  target,
  targetLabel = `Target ${target}°`,
  compact = false,
  highlightLatest = false,
}: {
  sessions: SessionRecord[]
  target: number
  targetLabel?: string
  compact?: boolean
  highlightLatest?: boolean
}) {
  const c = useThemeColors()
  const sorted = [...sessions].sort((a, b) => a.started_at.localeCompare(b.started_at))
  const data: Point[] = sorted.map((s, i) => ({ ...s, label: shortDate(s.started_at), latest: i === sorted.length - 1 }))

  const values = data.map((d) => d.max_angle)
  const lo = Math.floor((Math.min(target, ...values) - 10) / 10) * 10
  const hi = Math.ceil((Math.max(target, ...values) + 5) / 10) * 10
  const hasFlag = data.some((d) => d.flagged)
  const tick = { fill: c.muted, fontSize: 11, fontFamily: MONO }

  const dot = ({ cx, cy, payload, index }: DotProps, active: boolean) => {
    if (cx == null || cy == null || !payload) return <g key={index} />
    const flag = payload.flagged && !compact
    const color = flag ? c.critical : c['brand-ink']
    if (active || (highlightLatest && payload.latest) || flag) {
      return (
        <g key={index}>
          {active && <circle cx={cx} cy={cy} r={11} fill={color} fillOpacity={0.14} />}
          <circle cx={cx} cy={cy} r={active || payload.latest ? 6 : 4.5} fill={color} stroke={c.surface} strokeWidth={3} />
        </g>
      )
    }
    return <circle key={index} cx={cx} cy={cy} r={3.5} fill={c.surface} stroke={color} strokeWidth={2} />
  }

  return (
    <div>
      <div className={compact ? 'h-56' : 'h-64'}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 18, right: compact ? 4 : 88, bottom: 0, left: compact ? -22 : -8 }}>
            <CartesianGrid vertical={false} stroke={c.line} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: c['line-strong'] }} tick={tick} interval="preserveStartEnd" minTickGap={compact ? 40 : 24} dy={8} padding={{ left: 12, right: 20 }} />
            <YAxis
              domain={[lo, hi]}
              tickCount={(hi - lo) / 10 + 1}
              tickLine={false}
              axisLine={false}
              tick={tick}
              tickFormatter={(v: number) => `${v}°`}
            />
            <ReferenceLine
              y={target}
              stroke={c['ink-2']}
              strokeOpacity={0.5}
              strokeDasharray="4 5"
              label={{
                value: targetLabel.toUpperCase(),
                // Compact charts have no right gutter; the early sessions sit low, so the left end is clear.
                position: compact ? 'insideTopLeft' : 'right',
                fill: c['ink-2'],
                fontSize: 10.5,
                fontFamily: MONO,
                letterSpacing: '0.06em',
                dx: compact ? 0 : 6,
              }}
            />
            {!compact && <Tooltip content={<TooltipBox />} cursor={{ stroke: c['line-strong'], strokeWidth: 1 }} />}
            <Line
              type="monotone"
              dataKey="max_angle"
              stroke={c['brand-ink']}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={(p: DotProps) => dot(p, false)}
              activeDot={(p: DotProps) => dot(p, true)}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {hasFlag && !compact && (
        <p className="label-mono mt-3 flex items-center gap-2 text-ink-2">
          <span className="inline-block size-2 rounded-full bg-critical" /> Session with a pain flag
        </p>
      )}
    </div>
  )
}

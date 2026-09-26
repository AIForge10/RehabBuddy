import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { shortDate } from '../lib/format'
import { useThemeColors } from '../lib/useThemeColors'
import type { SessionRecord } from '../types/session'

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
    <div className="rounded-xl bg-surface px-3 py-2 text-xs shadow-lg ring-1 ring-line">
      <p className="font-semibold text-ink">
        {new Date(p.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
      </p>
      <p className="mt-1 tabular-nums text-ink-2">
        Peak <span className="font-semibold text-ink">{p.max_angle}°</span> · {p.reps_done} reps
        {p.pain_score != null && <> · pain {p.pain_score}/10</>}
      </p>
      {p.flagged && <p className="mt-1 font-semibold text-critical">Pain flag</p>}
    </div>
  )
}

export function RomChart({
  sessions,
  target,
  compact = false,
  highlightLatest = false,
}: {
  sessions: SessionRecord[]
  target: number
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

  const dot = ({ cx, cy, payload, index }: DotProps, active: boolean) => {
    if (cx == null || cy == null || !payload) return <g key={index} />
    const big = active || (highlightLatest && payload.latest)
    const fill = payload.flagged && !compact ? c.critical : c.brand
    return (
      <g key={index}>
        {big && <circle cx={cx} cy={cy} r={12} fill={fill} fillOpacity={0.18} />}
        <circle cx={cx} cy={cy} r={big ? 6 : 4} fill={fill} stroke={c.surface} strokeWidth={2} />
      </g>
    )
  }

  return (
    <div>
      <div className={compact ? 'h-40' : 'h-64'}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 14, right: compact ? 8 : 72, bottom: 0, left: compact ? -24 : -8 }}>
            <defs>
              <linearGradient id="rom-wash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.brand} stopOpacity={0.22} />
                <stop offset="100%" stopColor={c.brand} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={c.line} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: c.muted, fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={compact ? 40 : 24}
              dy={6}
            />
            <YAxis
              domain={[lo, hi]}
              tickCount={(hi - lo) / 10 + 1}
              tickLine={false}
              axisLine={false}
              tick={{ fill: c.muted, fontSize: 11 }}
              tickFormatter={(v: number) => `${v}°`}
            />
            <ReferenceLine
              y={target}
              stroke={c['ink-2']}
              strokeOpacity={0.6}
              strokeWidth={1}
              label={compact ? undefined : { value: `Target ${target}°`, position: 'right', fill: c['ink-2'], fontSize: 11, dx: 4 }}
            />
            {!compact && <Tooltip content={<TooltipBox />} cursor={{ stroke: c.line, strokeWidth: 1 }} />}
            <Area
              type="monotone"
              dataKey="max_angle"
              stroke={c.brand}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="url(#rom-wash)"
              dot={(p: DotProps) => dot(p, false)}
              activeDot={(p: DotProps) => dot(p, true)}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {hasFlag && !compact && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-2">
          <span className="inline-block size-2 rounded-full bg-critical" /> Session with a pain flag
        </p>
      )}
    </div>
  )
}

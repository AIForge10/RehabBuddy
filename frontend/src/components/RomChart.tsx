import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { shortDate } from '../lib/format'
import type { SessionRecord } from '../types/session'

// Recharts writes colors as SVG attributes, where CSS vars aren't reliable,
// so these mirror the tokens in index.css.
const C = {
  accent: '#0e6b66',
  critical: '#c23a3a',
  surface: '#fdfdfc',
  grid: '#e3e1da',
  axis: '#858680',
  ink: '#151716',
  ink2: '#4f524f',
}

interface Point {
  label: string
  max_angle: number
  reps_done: number
  pain_score: number | null
  flagged: boolean
  started_at: string
}

interface DotProps {
  cx?: number
  cy?: number
  index?: number
  payload?: Point
}

function Dot({ cx, cy, payload, r = 4 }: DotProps & { r?: number }) {
  if (cx == null || cy == null || !payload) return null
  return <circle cx={cx} cy={cy} r={r} fill={payload.flagged ? C.critical : C.accent} stroke={C.surface} strokeWidth={2} />
}

function TooltipBox({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-sm">
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

export function RomChart({ sessions, target }: { sessions: SessionRecord[]; target: number }) {
  const data: Point[] = [...sessions]
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
    .map((s) => ({ ...s, label: shortDate(s.started_at) }))

  const values = data.map((d) => d.max_angle)
  const lo = Math.floor((Math.min(target, ...values) - 10) / 10) * 10
  const hi = Math.ceil((Math.max(target, ...values) + 5) / 10) * 10
  const hasFlag = data.some((d) => d.flagged)

  return (
    <div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 72, bottom: 0, left: -8 }}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: C.grid }}
              tick={{ fill: C.axis, fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              domain={[lo, hi]}
              tickCount={(hi - lo) / 10 + 1}
              tickLine={false}
              axisLine={false}
              tick={{ fill: C.axis, fontSize: 11 }}
              tickFormatter={(v: number) => `${v}°`}
            />
            <ReferenceLine
              y={target}
              stroke={C.ink2}
              strokeWidth={1}
              label={{ value: `Target ${target}°`, position: 'right', fill: C.ink2, fontSize: 11 }}
            />
            <Tooltip content={<TooltipBox />} cursor={{ stroke: C.grid, strokeWidth: 1 }} />
            <Line
              type="monotone"
              dataKey="max_angle"
              stroke={C.accent}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={(p: DotProps) => <Dot key={p.index} {...p} />}
              activeDot={(p: DotProps) => <Dot key={p.index} {...p} r={6} />}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {hasFlag && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-2">
          <span className="inline-block size-2 rounded-full bg-critical" /> Session with a pain flag
        </p>
      )}
    </div>
  )
}

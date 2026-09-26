import { END_RANGE_WITHIN, FADE_FLAG, REACHED_WITHIN } from '../../lib/replay'
import type { SessionStats } from '../../types/session'

// Cells for the dashboard's sessions table, from the stats the backend works
// out over every angle sample (SessionStats). They let the therapist compare
// how sessions went, not just how deep they got, without opening each replay.

const H = 20
/** Most degrees the strip shows below its top: a 5° fade is visible, the usual rep-to-rep wobble isn't loud. */
const SPAN = 40
const WIDTH = 64
const MAX_STEP = 7

/** Each rep's peak as a thin bar under the target line; reps that fall off late show as a strip that slopes down. */
export function RepPeaks({ stats, target }: { stats: SessionStats | null | undefined; target: number }) {
  const peaks = stats?.rep_peaks ?? []
  if (!peaks.length) return <span className="text-muted">—</span>
  const top = Math.max(target, ...peaks) + 2
  const h = (a: number) => Math.max(2, (1 - (top - a) / SPAN) * H)
  const step = Math.min(MAX_STEP, WIDTH / peaks.length)
  const faded = stats!.fade != null && stats!.fade >= FADE_FLAG
  const label = `Rep peaks ${peaks.join(', ')}°${faded ? `; the last 3 averaged ${stats!.fade}° below the first 3` : ''}`
  return (
    <span role="img" aria-label={label} title={label} className="inline-flex items-center gap-2 align-middle">
      <svg width={peaks.length * step} height={H} className="block overflow-visible" aria-hidden="true">
        <line x1={-2} x2={peaks.length * step + 1} y1={H - h(target)} y2={H - h(target)} className="stroke-ink-2" strokeOpacity="0.5" strokeDasharray="2 2" strokeWidth="1" />
        {peaks.map((p, i) => (
          <rect
            key={i}
            x={i * step}
            y={H - h(p)}
            width={step * 0.7}
            height={h(p)}
            rx="1"
            className="fill-brand"
            fillOpacity={p >= target - REACHED_WITHIN ? 1 : 0.4}
          />
        ))}
      </svg>
      {faded && <span className="font-bold text-warn">−{stats!.fade}°</span>}
    </span>
  )
}

/** Seconds spent near the session's deepest bend; the longest single hold is in the tooltip and the replay. */
export function EndRange({ stats }: { stats: SessionStats | null | undefined }) {
  if (!stats) return <span className="text-muted">—</span>
  return (
    <span title={`Within ${END_RANGE_WITHIN}° of the deepest bend · longest hold ${stats.longest_hold_sec.toFixed(1)} s`}>
      {stats.end_range_sec.toFixed(1)} s
    </span>
  )
}

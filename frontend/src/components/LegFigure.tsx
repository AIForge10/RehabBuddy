// Side-view of a seated patient whose shin swings with the live flexion angle.
// Used in the briefing demo and in live sessions whenever the camera isn't
// available, so the stage always shows what's being measured: a shaded body on
// a chair with the tracked skeleton drawn over it, the way the pose model sees
// the leg.

import { FLOOR_Y, HIP, KNEE, MAX_FLEX, SHOULDER, ankleAt, toeAt } from '../lib/bodyGeometry'
import { SeatedBody } from './SeatedBody'

const ARC_R = 46
const LABEL_R = 84
/** Shift the scene so the chair and the leg's swing sit centred on the stage. */
const DX = -28
/** Where the floor meets the back wall: behind the chair, so its far legs stand on the floor. */
const WALL_Y = 380
const rad = (deg: number) => (deg * Math.PI) / 180

function arcPath(from: number, to: number, r: number) {
  const a = { x: KNEE.x + r * Math.cos(rad(from)), y: KNEE.y + r * Math.sin(rad(from)) }
  const b = { x: KNEE.x + r * Math.cos(rad(to)), y: KNEE.y + r * Math.sin(rad(to)) }
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x} ${b.y}`
}

type Pt = { x: number; y: number }
const seg = (a: Pt, b: Pt) => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })

export function LegFigure({
  angle,
  target,
  showLabel = true,
  tracking = true,
}: {
  angle: number | null
  target: number
  showLabel?: boolean
  /** Draw the tracked skeleton over the body; off for the plain demo. */
  tracking?: boolean
}) {
  const deg = Math.max(0, Math.min(MAX_FLEX, angle ?? 0))
  const ankle = ankleAt(deg)
  const toe = toeAt(deg)
  const ghost = ankleAt(target)
  const reached = deg >= target - 2
  const mid = rad(deg / 2)
  const label = { x: KNEE.x + LABEL_R * Math.cos(mid), y: KNEE.y + LABEL_R * Math.sin(mid) }

  return (
    <svg viewBox="0 0 720 450" className="h-full w-full" role="img" aria-label={`Knee bent ${Math.round(deg)} degrees`}>
      <defs>
        <pattern id="stage-dots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="white" fillOpacity="0.05" />
        </pattern>
        <radialGradient id="stage-spot" cx="0.5" cy="0.42" r="0.5">
          <stop offset="0" stopColor="white" stopOpacity="0.085" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="stage-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity="0.06" />
          <stop offset="1" stopColor="white" stopOpacity="0.015" />
        </linearGradient>
        <linearGradient id="stage-horizon" x1="0" x2="1">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.5" stopColor="white" stopOpacity="0.2" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="stage-pool">
          <stop offset="0" stopColor="white" stopOpacity="0.07" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
        {/* Backdrop fades out toward the edges, so it melts into the page when the stage isn't clipped (live view) */}
        <radialGradient id="stage-fade" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.7" stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id="stage-edges" maskContentUnits="objectBoundingBox">
          <rect width="1" height="1" fill="url(#stage-fade)" />
        </mask>
        <radialGradient id="knee-glow">
          <stop offset="0" style={{ stopColor: 'var(--rb-brand-glow)' }} stopOpacity="0.5" />
          <stop offset="1" style={{ stopColor: 'var(--rb-brand-glow)' }} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Stage: back wall with a soft key light, floor receding to the wall line */}
      <g mask="url(#stage-edges)">
        <rect width="720" height="450" fill="url(#stage-dots)" />
        <ellipse cx="370" cy="200" rx="340" ry="250" fill="url(#stage-spot)" />
        <rect x="0" y={WALL_Y} width="720" height={450 - WALL_Y} fill="url(#stage-floor)" />
        <rect x="40" y={WALL_Y - 0.75} width="640" height="1.5" fill="url(#stage-horizon)" />
        <ellipse cx="370" cy={FLOOR_Y - 4} rx="250" ry="34" fill="url(#stage-pool)" />
      </g>

      <g transform={`translate(${DX} 0)`}>
        <SeatedBody angle={deg} />

        {/* Target: dotted ray from the knee to where the ankle should reach */}
        <line
          {...seg(KNEE, ghost)}
          className="stroke-brand-glow"
          strokeOpacity={reached ? 0.85 : 0.5}
          strokeWidth="3.5"
          strokeDasharray="0.1 10"
          strokeLinecap="round"
        />
        <circle cx={ghost.x} cy={ghost.y} r="9" fill="none" className="stroke-brand-glow" strokeOpacity={reached ? 0.9 : 0.55} strokeWidth="2.5" />
        <circle cx={ghost.x} cy={ghost.y} r="2.6" className="fill-brand-glow" fillOpacity={reached ? 1 : 0.65} />

        {/* Flexion arc: faint track to the target, filled to the current angle */}
        <path d={arcPath(0, target, ARC_R)} fill="none" stroke="white" strokeOpacity="0.2" strokeWidth="2" />
        {deg > 2 && (
          <>
            <path d={`${arcPath(0, deg, ARC_R)} L ${KNEE.x} ${KNEE.y} Z`} className="fill-brand-glow" fillOpacity="0.18" />
            <path d={arcPath(0, deg, ARC_R)} fill="none" className="stroke-brand-glow" strokeWidth="3.5" strokeLinecap="round" />
          </>
        )}

        {/* Tracked skeleton: dark halo under white bones so they read on the body */}
        {tracking && (
          <>
            <g fill="none" strokeLinecap="round" strokeLinejoin="round">
              <g className="stroke-stage" strokeOpacity="0.5" strokeWidth="6.5">
                <line {...seg(SHOULDER, HIP)} />
                <line {...seg(HIP, KNEE)} />
                <line {...seg(KNEE, ankle)} />
                <line {...seg(ankle, toe)} />
              </g>
              <line {...seg(SHOULDER, HIP)} stroke="white" strokeOpacity="0.6" strokeWidth="2.75" />
              <line {...seg(HIP, KNEE)} stroke="white" strokeOpacity="0.9" strokeWidth="2.75" />
              <line
                {...seg(KNEE, ankle)}
                className={`transition-[stroke] duration-300 ${reached ? 'stroke-brand-glow' : 'stroke-white'}`}
                strokeOpacity="0.95"
                strokeWidth="2.75"
              />
              <line {...seg(ankle, toe)} stroke="white" strokeOpacity="0.8" strokeWidth="2.25" />
            </g>
            <g fill="white" className="stroke-stage" strokeWidth="2.25">
              <circle cx={SHOULDER.x} cy={SHOULDER.y} r="4" fillOpacity="0.85" />
              <circle cx={HIP.x} cy={HIP.y} r="4.75" />
              <circle cx={ankle.x} cy={ankle.y} r="4.75" />
              <circle cx={toe.x} cy={toe.y} r="3.5" />
            </g>
          </>
        )}
        <circle cx={KNEE.x} cy={KNEE.y} r="28" fill="url(#knee-glow)" />
        <circle cx={KNEE.x} cy={KNEE.y} r="9" className="fill-brand-glow" stroke="white" strokeWidth="2.75" />

        {showLabel && deg > 20 && (
          <text
            x={label.x}
            y={label.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="white"
            className="text-[22px] font-bold tabular-nums"
            style={{ paintOrder: 'stroke', stroke: 'var(--rb-stage)', strokeWidth: 6, strokeLinejoin: 'round' }}
          >
            {Math.round(deg)}°
          </text>
        )}
      </g>
    </svg>
  )
}

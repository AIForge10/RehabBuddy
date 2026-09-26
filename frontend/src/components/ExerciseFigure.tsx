// Side view of the seated patient doing the exercise, posed from the live or
// demo angle. Used in the briefing demo and in live sessions whenever the
// camera isn't available, so the stage always shows what's being measured:
// the shaded body on a chair, the measured angle as an arc from the joint's
// zero line, a dotted ray to the target, and (while tracking) the skeleton
// the pose model sees.
//
// Each exercise frames the stage its own way (a raised arm needs headroom,
// the wrist needs a close-up), so every overlay size is scaled by `k` to look
// the same on screen whatever the zoom. Switching exercise is a camera move,
// not a cut: from wherever she is, the view glides to the new framing while
// she settles into the new start position, and the readouts hand over from
// one joint to the other.

import { useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { FLOOR_Y, jointsAt, type Joint, type Pose } from '../lib/bodyGeometry'
import type { Exercise, View } from '../lib/exercises'
import { useLanguage } from '../lib/language'
import { useReducedMotion } from '../lib/useReducedMotion'
import { SeatedBody } from './SeatedBody'

/** Where the floor meets the back wall: behind the chair, so its far legs stand on the floor. */
const WALL_Y = 380
/** How long the camera takes to reframe on a new exercise: inside the demo's start hold. */
const MOVE_MS = 1200
const deg = (r: number) => (r * 180) / Math.PI
const rad = (d: number) => (d * Math.PI) / 180

type Pt = { x: number; y: number }
const seg = (a: Pt, b: Pt) => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
const dir = (from: Pt, to: Pt) => deg(Math.atan2(to.y - from.y, to.x - from.x))
/** Signed turn from `a` to `b`, the short way round. */
const sweep = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180

const smooth = (t: number) => t * t * (3 - 2 * t)
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
const mix = (a: number, b: number, t: number) => a + (b - a) * t

/** Every joint angle part of the way from `a` to `b`. */
const mixPose = (a: Pose, b: Pose, t: number): Pose => ({
  hip: mix(a.hip, b.hip, t),
  knee: mix(a.knee, b.knee, t),
  shoulder: mix(a.shoulder, b.shoulder, t),
  elbow: mix(a.elbow, b.elbow, t),
  wrist: mix(a.wrist, b.wrist, t),
})

/**
 * A camera move from `a` to `b`: a zoom about the one point both framings
 * share, paced so each moment scales by the same ratio instead of rushing
 * the close-up at the end.
 */
function mixView(a: View, b: View, t: number): View {
  const w = a.w * (b.w / a.w) ** t
  const u = a.w === b.w ? t : (w - a.w) / (b.w - a.w)
  return { x: mix(a.x, b.x, u), y: mix(a.y, b.y, u), w, h: mix(a.h, b.h, u) }
}

/** What's on stage, kept so a switch can pick up from it. */
interface Shot {
  exercise: Exercise
  view: View
  pose: Pose
  value: number
  target: number
  /** How far the readout had faded in. */
  shown: number
}

/**
 * The move under way after the exercise changed: from the last shot on stage
 * (mid-rep, or mid-move from an earlier switch), `t` 0 → 1. Null when settled.
 */
function useMove(exercise: Exercise, last: RefObject<Shot | null>) {
  const reduced = useReducedMotion()
  const [move, setMove] = useState<{ from: Shot; t: number } | null>(null)
  useLayoutEffect(() => {
    const from = last.current
    if (reduced || !from || from.exercise === exercise) return
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = (now - t0) / MOVE_MS
      setMove(t < 1 ? { from, t } : null)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    // Before the browser paints, so the new framing never flashes up first.
    // oxlint-disable-next-line react/set-state-in-effect -- a layout effect's re-render lands before paint, which is the point
    setMove({ from, t: 0 })
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [exercise, reduced, last])
  return move
}

function arcPath(c: Pt, from: number, turn: number, r: number) {
  const a = { x: c.x + r * Math.cos(rad(from)), y: c.y + r * Math.sin(rad(from)) }
  const b = { x: c.x + r * Math.cos(rad(from + turn)), y: c.y + r * Math.sin(rad(from + turn)) }
  return `M ${a.x} ${a.y} A ${r} ${r} 0 0 ${turn > 0 ? 1 : 0} ${b.x} ${b.y}`
}

export function ExerciseFigure({
  exercise,
  angle,
  target,
  showLabel = true,
  tracking = true,
}: {
  exercise: Exercise
  angle: number | null
  target: number
  showLabel?: boolean
  /** Draw the tracked skeleton over the body; off for the plain demo. */
  tracking?: boolean
}) {
  const { lang } = useLanguage()
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const id = (name: string) => `${name}-${uid}`
  const last = useRef<Shot | null>(null)
  const move = useMove(exercise, last)
  const from = move?.from

  const value = Math.max(Math.min(exercise.min, exercise.rest), Math.min(exercise.max, angle ?? exercise.rest))
  const e = move ? smooth(move.t) : 1
  const view = from ? mixView(from.view, exercise.view, e) : exercise.view
  const k = view.w / 720
  const pose = from ? mixPose(from.pose, exercise.pose(value), e) : exercise.pose(value)
  // The last joint's readout lets go early; the new one arrives as the camera settles.
  const shown = move ? smooth(clamp01((move.t - 0.45) / 0.55)) : 1
  const leaving = move && move.t < 0.4 ? move.from.shown * (1 - smooth(move.t / 0.4)) : 0
  const overlay = { pose, k, tracking, glow: `url(#${id('glow')})` }

  // After useMove's effect has read the outgoing shot.
  useLayoutEffect(() => {
    last.current = { exercise, view, pose, value, target, shown }
  })

  return (
    <svg
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      className="h-full w-full"
      role="img"
      aria-label={`${exercise.copy[lang].angleLabel} ${Math.round(value)}°`}
    >
      <defs>
        <pattern id={id('dots')} width={24 * k} height={24 * k} patternUnits="userSpaceOnUse">
          <circle cx={k} cy={k} r={k} fill="white" fillOpacity="0.05" />
        </pattern>
        <radialGradient id={id('spot')} cx="0.5" cy="0.42" r="0.5">
          <stop offset="0" stopColor="white" stopOpacity="0.085" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id('floor')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity="0.06" />
          <stop offset="1" stopColor="white" stopOpacity="0.015" />
        </linearGradient>
        <linearGradient id={id('horizon')} x1="0" x2="1">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.5" stopColor="white" stopOpacity="0.2" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id('pool')}>
          <stop offset="0" stopColor="white" stopOpacity="0.07" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
        {/* Backdrop fades out toward the edges, so it melts into the page when the stage isn't clipped (live view) */}
        <radialGradient id={id('fade')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.7" stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id={id('edges')} maskContentUnits="objectBoundingBox">
          <rect width="1" height="1" fill={`url(#${id('fade')})`} />
        </mask>
        <radialGradient id={id('glow')}>
          <stop offset="0" style={{ stopColor: 'var(--rb-brand-glow)' }} stopOpacity="0.5" />
          <stop offset="1" style={{ stopColor: 'var(--rb-brand-glow)' }} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Stage: back wall with a soft key light, floor receding to the wall line */}
      <g mask={`url(#${id('edges')})`}>
        <rect x={view.x} y={view.y} width={view.w} height={view.h} fill={`url(#${id('dots')})`} />
        <ellipse cx={view.x + view.w * 0.514} cy={view.y + view.h * 0.444} rx={view.w * 0.472} ry={view.h * 0.556} fill={`url(#${id('spot')})`} />
        <rect x={view.x} y={WALL_Y} width={view.w} height={Math.max(0, view.y + view.h - WALL_Y)} fill={`url(#${id('floor')})`} />
        <rect x={view.x + view.w * 0.055} y={WALL_Y - 0.75} width={view.w * 0.89} height="1.5" fill={`url(#${id('horizon')})`} />
        <ellipse cx="398" cy={FLOOR_Y - 4} rx="250" ry="34" fill={`url(#${id('pool')})`} />
      </g>

      <SeatedBody pose={pose} />

      {from && leaving > 0 && <Readout {...overlay} exercise={from.exercise} value={from.value} target={from.target} opacity={leaving} />}
      <Readout {...overlay} exercise={exercise} value={value} target={target} showLabel={showLabel} opacity={shown} />
    </svg>
  )
}

/** The measurement drawn over the body: target ray, angle arc, tracked skeleton and the measured joint. */
function Readout({
  exercise,
  pose,
  value,
  target,
  k,
  tracking,
  glow,
  showLabel = false,
  opacity,
}: {
  exercise: Exercise
  /** The body as drawn, so the overlay stays on her. */
  pose: Pose
  value: number
  target: number
  k: number
  tracking: boolean
  /** Fill for the halo behind the measured joint. */
  glow: string
  showLabel?: boolean
  opacity: number
}) {
  const { measure, chain } = exercise
  const j = jointsAt(pose)
  const [from, at, to] = measure.map((m) => j[m]) as [Pt, Pt, Pt]
  const goalJoints = jointsAt(exercise.pose(target))
  const ghost = goalJoints[exercise.reach ?? measure[2]]
  const reached = value >= target - 2

  // The reading is the turn from the joint's zero line: the proximal segment
  // carried on through the joint (flexion), or pointing back along it (shoulder).
  const zero = exercise.reading === 'direct' ? dir(at, from) : dir(from, at)
  const now = sweep(zero, dir(at, to))
  const goal = sweep(zero, dir(at, goalJoints[measure[2]]))
  const r = Math.min(46, Math.hypot(to.x - at.x, to.y - at.y) * 0.62)
  const mid = rad(zero + now / 2)
  const labelR = r + 38 * k
  const label = { x: at.x + labelR * Math.cos(mid), y: at.y + labelR * Math.sin(mid) }
  const moving = (a: Joint, b: Joint) => a === measure[1] && b === measure[2]
  const links = chain.slice(1).map((b, i) => [chain[i], b] as const)

  return (
    <g opacity={opacity}>
      {/* Target: dotted ray from the joint to where the limb should reach */}
      <line {...seg(at, ghost)} className="stroke-brand-glow" strokeOpacity={reached ? 0.85 : 0.5} strokeWidth={3.5 * k} strokeDasharray={`${0.1 * k} ${10 * k}`} strokeLinecap="round" />
      <circle cx={ghost.x} cy={ghost.y} r={9 * k} fill="none" className="stroke-brand-glow" strokeOpacity={reached ? 0.9 : 0.55} strokeWidth={2.5 * k} />
      <circle cx={ghost.x} cy={ghost.y} r={2.6 * k} className="fill-brand-glow" fillOpacity={reached ? 1 : 0.65} />

      {/* Angle arc: faint track to the target, filled to the current reading */}
      <path d={arcPath(at, zero, goal, r)} fill="none" stroke="white" strokeOpacity="0.2" strokeWidth={2 * k} />
      {Math.abs(now) > 2 && (
        <>
          <path d={`${arcPath(at, zero, now, r)} L ${at.x} ${at.y} Z`} className="fill-brand-glow" fillOpacity="0.18" />
          <path d={arcPath(at, zero, now, r)} fill="none" className="stroke-brand-glow" strokeWidth={3.5 * k} strokeLinecap="round" />
        </>
      )}

      {/* Tracked skeleton: dark halo under white bones so they read on the body */}
      {tracking && (
        <>
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <g className="stroke-stage" strokeOpacity="0.5" strokeWidth={6.5 * k}>
              {links.map(([a, b]) => (
                <line key={a + b} {...seg(j[a], j[b])} />
              ))}
            </g>
            {links.map(([a, b]) => (
              <line
                key={a + b}
                {...seg(j[a], j[b])}
                className={moving(a, b) ? `transition-[stroke] duration-300 ${reached ? 'stroke-brand-glow' : 'stroke-white'}` : 'stroke-white'}
                strokeOpacity={moving(a, b) ? 0.95 : 0.8}
                strokeWidth={2.75 * k}
              />
            ))}
          </g>
          <g fill="white" className="stroke-stage" strokeWidth={2.25 * k}>
            {chain
              .filter((c) => c !== measure[1])
              .map((c) => (
                <circle key={c} cx={j[c].x} cy={j[c].y} r={4.5 * k} />
              ))}
          </g>
        </>
      )}
      <circle cx={at.x} cy={at.y} r={28 * k} fill={glow} />
      <circle cx={at.x} cy={at.y} r={9 * k} className="fill-brand-glow" stroke="white" strokeWidth={2.75 * k} />

      {showLabel && Math.abs(now) > 20 && (
        <text
          x={label.x}
          y={label.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize={22 * k}
          className="font-bold tabular-nums"
          style={{ paintOrder: 'stroke', stroke: 'var(--rb-stage)', strokeWidth: 6 * k, strokeLinejoin: 'round' }}
        >
          {Math.round(value)}°
        </text>
      )}
    </g>
  )
}

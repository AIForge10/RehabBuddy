// Turns raw MediaPipe results into one steady joint angle. No React and no DOM,
// so the live session and the /pose-debug page run the exact same pipeline:
//
//   landmarks → pick a side → angle in pixels (or 3D world) → median-of-3 → One Euro → hold short dropouts
import type { Landmark, NormalizedLandmark, PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import { angleAt, angleAt3d, reading, toPixels, type Point } from './angle'
import { Median3, OneEuroFilter } from './filters'
import { FormCheck, type FormReading } from './form'
import { JOINTS, type JointName } from './joints'
import type { PoseDelegate, PoseModel } from './landmarker'

export type PreferredSide = 'auto' | 'left' | 'right'
type Side = 0 | 1

export interface PoseTuning {
  model: PoseModel
  delegate: PoseDelegate
  /** MediaPipe's own thresholds (0–1). */
  minDetection: number
  minPresence: number
  minTracking: number
  /** A limb counts as seen when its joint and distal point are both at least this visible. */
  minVisibility: number
  /** '2d': angle in the image plane (camera side-on). '3d': MediaPipe's world landmarks (view-independent, noisier). */
  angleSource: '2d' | '3d'
  /** Median-of-3 before the One Euro filter, to drop one-frame spikes. */
  median: boolean
  /** One Euro filter (see filters.ts). */
  minCutoff: number
  beta: number
  /** Keep showing the last angle through dropouts shorter than this, instead of flashing "not visible". */
  holdMs: number
  /** In auto, the other side must score higher this many frames in a row before tracking switches to it. */
  switchFrames: number
  /** Follow the physical limb when MediaPipe trades the left/right labels between frames. */
  followSwaps: boolean
  /** Form checks (form.ts). Off = never flag a form fault. */
  formCheck: boolean
  /** A form fault counts once it has held this long, and clears once it has been gone this long. */
  formHoldMs: number
  /** Knee: the thigh turns this far from where it lay at rest. */
  thighMoveDeg: number
  /** Hip: the trunk leans back this far past vertical. */
  leanBackDeg: number
  /** Elbow: the upper arm swings this far off vertical. */
  elbowDriftDeg: number
  /** Shoulder: the shoulder closes this share (%) of the ear-to-shoulder gap it had at rest. */
  shrugPct: number
  /** Shoulder: shrugging is only judged below this arm angle; higher, the shoulder rises on its own. */
  shrugMaxArm: number
}

export const DEFAULT_TUNING: PoseTuning = {
  model: 'full',
  delegate: 'GPU',
  minDetection: 0.5,
  minPresence: 0.5,
  minTracking: 0.5,
  minVisibility: 0.5,
  angleSource: '2d',
  median: true,
  // Swept on synthetic reps with 3 px landmark noise: as steady at rest as the old
  // 5-frame average (σ 0.8°), 25% less lag mid-rep, peaks within 0.2°, no one-frame spikes.
  minCutoff: 1,
  beta: 0.1,
  holdMs: 400,
  switchFrames: 10,
  followSwaps: true,
  // Form thresholds are set well past normal movement, so a fault is only called
  // when it's plain to see. Not yet tuned on real sessions: do that on /pose-debug.
  formCheck: true,
  formHoldMs: 500,
  thighMoveDeg: 20,
  leanBackDeg: 25,
  elbowDriftDeg: 30,
  shrugPct: 35,
  shrugMaxArm: 100,
}

// Auto side-picking score = visibility + nearness to the camera + recent movement.
// Side-on, the limb nearest the camera is the one tracked well; facing the
// camera, both arms are equally near, so the one that's moving is the one exercising.
const DEPTH_WEIGHT = 1
const MOTION_WEIGHT = 0.4
const MOTION_FULL_DEG = 60 // this much movement over MOTION_WINDOW_MS earns the full motion bonus
const MOTION_WINDOW_MS = 2000
const SWITCH_MARGIN = 0.1
// A label swap: our limb jumped more than this share of the frame diagonal while
// the other label landed within SWAP_RATIO of where ours was.
const SWAP_MIN_JUMP = 0.08
const SWAP_RATIO = 0.4
const SWAP_MAX_GAP_MS = 200
// Landmarks outside the frame come back extrapolated (and wrong); allow a small margin.
const FRAME_MARGIN = 0.05
// Shoulder: with the hip out of frame, measure the arm against straight down.
const HIP_LOW_Y = 0.95

export interface SideInfo {
  visible: boolean
  /** Lower of the joint's and the distal point's visibility. */
  visibility: number
  /** Mean z of the joint and distal point; smaller = nearer the camera. */
  depth: number
  /** Angle range over the last 2 s, degrees. */
  motion: number
  score: number
  angle2d: number
  angle3d: number | null
  /** The old math: same points, normalized coordinates (no aspect correction). */
  legacy: number
  /** [proximal, joint, distal] in normalized coordinates, for drawing. */
  points: [NormalizedLandmark, NormalizedLandmark, NormalizedLandmark]
  /** 'vertical' when the shoulder is measured against straight down (hip not visible). */
  anchor: 'landmark' | 'vertical'
}

export interface TrackFrame {
  timeMs: number
  /** Filtered angle; the last good value while `held`; null when the limb is lost. */
  angle: number | null
  /** Unfiltered angle from the chosen source, this frame (null when not measured this frame). */
  rawAngle: number | null
  angle2d: number | null
  angle3d: number | null
  legacyAngle: number | null
  side: 'left' | 'right' | null
  /** True while bridging a short dropout with the last good angle. */
  held: boolean
  points: NormalizedLandmark[] | null
  anchor: SideInfo['anchor'] | null
  /** Lowest visibility of the three measured points. */
  confidence: number
  /** Why this side was (or wasn't) picked, for the debug page. */
  reason: string
  swapped: boolean
  sides: [SideInfo, SideInfo] | null
  landmarks: NormalizedLandmark[] | null
  worldLandmarks: Landmark[] | null
  /** The joint's form check this frame; null when it has none or checks are off. */
  form: FormReading | null
}

const NAMES = ['left', 'right'] as const
const vis = (p: { visibility?: number } | undefined) => p?.visibility ?? 0
const inFrame = (p: Point) =>
  p.x >= -FRAME_MARGIN && p.x <= 1 + FRAME_MARGIN && p.y >= -FRAME_MARGIN && p.y <= 1 + FRAME_MARGIN

export class JointTracker {
  private joint: JointName
  private preferred: PreferredSide
  private tuning: PoseTuning
  private median = new Median3()
  private euro: OneEuroFilter
  private side: Side | null = null
  private pending = 0
  private lastSeen = -Infinity
  private last: { angle: number; points: NormalizedLandmark[]; side: Side; anchor: SideInfo['anchor']; confidence: number } | null = null
  private lastPx: { j: Point; b: Point } | null = null
  private history: [{ t: number; a: number }[], { t: number; a: number }[]] = [[], []]
  private form = new FormCheck()

  constructor(joint: JointName, preferred: PreferredSide = 'auto', tuning: Partial<PoseTuning> = {}) {
    this.joint = joint
    this.preferred = preferred
    this.tuning = { ...DEFAULT_TUNING, ...tuning }
    this.euro = new OneEuroFilter(this.tuning.minCutoff, this.tuning.beta)
  }

  setTuning(tuning: Partial<PoseTuning>) {
    this.tuning = { ...DEFAULT_TUNING, ...tuning }
    this.euro.minCutoff = this.tuning.minCutoff
    this.euro.beta = this.tuning.beta
  }

  /** New joint or side: forget everything. */
  configure(joint: JointName, preferred: PreferredSide) {
    if (joint === this.joint && preferred === this.preferred) return
    this.joint = joint
    this.preferred = preferred
    this.reset()
  }

  reset() {
    this.resetFilters()
    this.side = null
    this.pending = 0
    this.lastSeen = -Infinity
    this.last = null
    this.lastPx = null
    this.history = [[], []]
    this.form.reset()
  }

  private resetFilters() {
    this.median.reset()
    this.euro.reset()
  }

  process(res: PoseLandmarkerResult, width: number, height: number, t: number): TrackFrame {
    const lm = res.landmarks[0] ?? null
    const world = res.worldLandmarks[0] ?? null
    if (!lm) return this.miss(t, 'No person detected', null, null, null)

    const sides: [SideInfo, SideInfo] = [this.measure(lm, world, 0, width, height, t), this.measure(lm, world, 1, width, height, t)]
    for (const s of [0, 1] as const) {
      const o = sides[1 - s]
      const info = sides[s]
      const nearer = Math.max(-0.3, Math.min(0.3, o.depth - info.depth))
      info.score = info.visibility + DEPTH_WEIGHT * nearer + (MOTION_WEIGHT * Math.min(info.motion, MOTION_FULL_DEG)) / MOTION_FULL_DEG
    }

    const pick = this.pickSide(lm, sides, width, height, t)
    if (pick.side === null) return this.miss(t, pick.reason, sides, lm, world)

    const info = sides[pick.side]
    const raw = this.tuning.angleSource === '3d' && info.angle3d != null ? info.angle3d : info.angle2d
    const otherLimb = this.last != null && this.last.side !== pick.side && !pick.swapped
    // Back after a real gap, or onto the other limb: start the filters fresh instead of gliding from a stale value.
    if (t - this.lastSeen > this.tuning.holdMs || otherLimb) this.resetFilters()
    // The form check's rest references belong to the limb they were learned on.
    if (otherLimb) this.form.reset()
    const angle = this.euro.filter(this.tuning.median ? this.median.push(raw) : raw, t)
    const seen = (i: number) => vis(lm[i]) >= this.tuning.minVisibility && inFrame(lm[i])
    const form = this.form.update(JOINTS[this.joint], this.tuning, t, { lm, side: pick.side, angle, w: width, h: height, seen })

    const [a, j, b] = info.points
    const confidence = Math.min(info.anchor === 'vertical' ? 1 : vis(a), vis(j), vis(b))
    this.lastSeen = t
    this.last = { angle, points: info.points, side: pick.side, anchor: info.anchor, confidence }
    this.lastPx = { j: toPixels(j, width, height), b: toPixels(b, width, height) }

    return {
      timeMs: t,
      angle,
      rawAngle: raw,
      angle2d: info.angle2d,
      angle3d: info.angle3d,
      legacyAngle: info.legacy,
      side: NAMES[pick.side],
      held: false,
      points: info.points,
      anchor: info.anchor,
      confidence,
      reason: pick.reason,
      swapped: pick.swapped,
      sides,
      landmarks: lm,
      worldLandmarks: world,
      form,
    }
  }

  /** Nothing measurable this frame: bridge short gaps with the last good angle. */
  private miss(
    t: number,
    reason: string,
    sides: [SideInfo, SideInfo] | null,
    lm: NormalizedLandmark[] | null,
    world: Landmark[] | null,
  ): TrackFrame {
    const held = this.last != null && t - this.lastSeen <= this.tuning.holdMs
    if (!held) {
      this.last = null
      this.resetFilters()
      this.form.reset()
    }
    const l = held ? this.last : null
    return {
      timeMs: t,
      angle: l?.angle ?? null,
      rawAngle: null,
      angle2d: null,
      angle3d: null,
      legacyAngle: null,
      side: l ? NAMES[l.side] : null,
      held,
      points: l?.points ?? null,
      anchor: l?.anchor ?? null,
      confidence: l?.confidence ?? 0,
      reason: held ? `${reason} (holding last angle)` : reason,
      swapped: false,
      sides,
      landmarks: lm,
      worldLandmarks: world,
      form: this.form.update(JOINTS[this.joint], this.tuning, t, null),
    }
  }

  private measure(lm: NormalizedLandmark[], world: Landmark[] | null, s: Side, w: number, h: number, t: number): SideInfo {
    const cfg = JOINTS[this.joint]
    const j = lm[cfg.joint[s]]
    const b = lm[cfg.b[s]]
    const hip = lm[cfg.a[s]]
    const visibility = Math.min(vis(j), vis(b))
    const visible = visibility >= this.tuning.minVisibility && inFrame(j) && inFrame(b)

    const anchor: SideInfo['anchor'] =
      this.joint === 'shoulder' && (vis(hip) < this.tuning.minVisibility || hip.y > HIP_LOW_Y) ? 'vertical' : 'landmark'
    const a: NormalizedLandmark = anchor === 'vertical' ? { x: j.x, y: j.y + 0.3, z: j.z, visibility: 1 } : hip

    const angle2d = reading(cfg, angleAt(toPixels(a, w, h), toPixels(j, w, h), toPixels(b, w, h)))
    const legacy = reading(cfg, angleAt(a, j, b))
    let angle3d: number | null = null
    if (world) {
      const wj = world[cfg.joint[s]]
      const wa = anchor === 'vertical' ? { x: wj.x, y: wj.y + 0.5, z: wj.z } : world[cfg.a[s]]
      angle3d = reading(cfg, angleAt3d(wa, wj, world[cfg.b[s]]))
    }

    const hist = this.history[s]
    if (visible) hist.push({ t, a: angle2d })
    while (hist.length && t - hist[0].t > MOTION_WINDOW_MS) hist.shift()
    let lo = Infinity
    let hi = -Infinity
    for (const e of hist) {
      lo = Math.min(lo, e.a)
      hi = Math.max(hi, e.a)
    }

    return {
      visible,
      visibility,
      depth: ((j.z ?? 0) + (b.z ?? 0)) / 2,
      motion: hist.length ? hi - lo : 0,
      score: 0,
      angle2d,
      angle3d,
      legacy,
      points: [a, j, b],
      anchor,
    }
  }

  private pickSide(
    lm: NormalizedLandmark[],
    sides: [SideInfo, SideInfo],
    w: number,
    h: number,
    t: number,
  ): { side: Side | null; reason: string; swapped: boolean } {
    const cfg = JOINTS[this.joint]
    const limb = this.joint

    if (this.preferred !== 'auto') {
      const s: Side = this.preferred === 'left' ? 0 : 1
      this.side = s
      return sides[s].visible
        ? { side: s, reason: `Locked to the ${NAMES[s]} ${limb}`, swapped: false }
        : { side: null, reason: `The ${NAMES[s]} ${limb} isn't visible`, swapped: false }
    }

    let cur = this.side
    // MediaPipe sometimes trades the left/right labels between frames, especially
    // side-on. If our limb "jumped" and the other label is now where ours was,
    // it's the same physical limb: follow it instead of measuring the other one.
    if (cur !== null && this.tuning.followSwaps && this.lastPx && t - this.lastSeen <= SWAP_MAX_GAP_MS) {
      const o: Side = cur === 0 ? 1 : 0
      const dist = (s: Side) =>
        Math.hypot(lm[cfg.joint[s]].x * w - this.lastPx!.j.x, lm[cfg.joint[s]].y * h - this.lastPx!.j.y) +
        Math.hypot(lm[cfg.b[s]].x * w - this.lastPx!.b.x, lm[cfg.b[s]].y * h - this.lastPx!.b.y)
      const same = dist(cur)
      const other = dist(o)
      if (sides[o].visible && same > SWAP_MIN_JUMP * Math.hypot(w, h) && other < same * SWAP_RATIO) {
        this.side = o
        this.pending = 0
        return { side: o, reason: 'MediaPipe swapped the left/right labels; following the same limb', swapped: true }
      }
    }

    if (cur !== null && !sides[cur].visible) {
      // Our limb dropped out. Wait out short dropouts (the angle is held) rather
      // than jumping to the other limb, which reads a different angle and can fake a rep.
      if (t - this.lastSeen <= this.tuning.holdMs) return { side: null, reason: `The ${NAMES[cur]} ${limb} dropped out`, swapped: false }
      cur = null
    }

    const candidates = ([0, 1] as const).filter((s) => sides[s].visible)
    if (!candidates.length) {
      this.side = null
      return { side: null, reason: `Neither ${limb} is visible`, swapped: false }
    }

    if (cur === null) {
      const s: Side = candidates.length === 1 ? candidates[0] : sides[0].score >= sides[1].score ? 0 : 1
      this.side = s
      this.pending = 0
      const why = candidates.length === 1 ? `only the ${NAMES[s]} ${limb} is visible` : `the ${NAMES[s]} ${limb} scores higher`
      return { side: s, reason: `Picked ${NAMES[s]}: ${why}`, swapped: false }
    }

    const o: Side = cur === 0 ? 1 : 0
    if (sides[o].visible && sides[o].score > sides[cur].score + SWITCH_MARGIN) {
      this.pending += 1
      if (this.pending >= this.tuning.switchFrames) {
        this.side = o
        this.pending = 0
        return { side: o, reason: `Switched to ${NAMES[o]}: it scored higher for ${this.tuning.switchFrames} frames`, swapped: false }
      }
      return { side: cur, reason: `The ${NAMES[o]} ${limb} is scoring higher (${this.pending}/${this.tuning.switchFrames})`, swapped: false }
    }
    this.pending = 0
    return { side: cur, reason: `Tracking the ${NAMES[cur]} ${limb}`, swapped: false }
  }
}

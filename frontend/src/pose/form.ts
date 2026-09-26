// Form checks: at most one fault per joint (JOINTS[joint].fault), judged on the
// limb the tracker is following. No React and no DOM, like tracker.ts, so the
// live session and /pose-debug flag exactly the same faults.
//
// Each check is one number held against a threshold in PoseTuning, measured in
// pixels in the same side-on view as the angle:
//   knee      thigh_moving    how far the thigh (hip → knee) has turned from where it lay at rest.
//                             Caving inward, the usual knee fault, happens toward a side-on
//                             camera and can't be seen; the thigh lifting or sliding can.
//   hip       leaning_back    how far the trunk (hip → shoulder) leans back past vertical.
//                             "Back" is away from the knee, which is ahead of the hip mid-rep.
//   elbow     elbow_drifting  how far the upper arm (shoulder → elbow) has swung off vertical.
//   shoulder  shrugging       how much of its resting ear-to-shoulder gap the shoulder has closed.
//                             Only below shrugMaxArm: higher up, the shoulder rises on its own.
// The wrist has none: its angle is still experimental, and every check leans on the angle.
//
// A false "you're doing it wrong" is worse than a missed fault, so every check
// errs toward silence. Form is only judged mid-rep (never at rest), a point
// that isn't clearly seen reads as fine, and a fault only counts once it has
// held for formHoldMs without a break. It then stays until the number has been
// back under OFF_RATIO of the threshold for as long, so a rep hovering near the
// line counts once instead of every time it wobbles across.
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { Median3 } from './filters'
import type { FormFault, JointConfig } from './joints'
import type { PoseTuning } from './tracker'

type Vec = { x: number; y: number }

// Mid-fault, "still off" is judged against this share of the threshold.
export const OFF_RATIO = 0.7
// A fault also needs this many frames in a row, so a slow camera can't flag one from two frames.
const MIN_FRAMES = 4
// Rest references are a running average over the rest frames, trusted after REST_FRAMES of them.
const REST_WEIGHT = 0.1
const REST_FRAMES = 5
const EAR: [number, number] = [7, 8]
// Forward is only clear once the knee is this share of the thigh's length ahead of the hip.
const MIN_FORWARD = 0.3
// A resting ear-to-shoulder gap under this share of the frame height is too small to judge a shrug by.
const MIN_GAP = 0.02

export interface FormReading {
  fault: FormFault
  /** This frame's measure, in `unit`; null when form can't be judged this frame (`note` says why). */
  value: number | null
  /** The threshold from PoseTuning. */
  limit: number
  unit: '°' | '%'
  /** The fault has held for formHoldMs and hasn't cleared yet. */
  active: boolean
  /** What the check is doing this frame, for /pose-debug. */
  note: string
  /** The two points the check measures, for drawing. */
  points: [NormalizedLandmark, NormalizedLandmark] | null
}

/** What the tracker measured this frame. */
export interface FormFrame {
  lm: NormalizedLandmark[]
  side: 0 | 1
  /** The filtered joint angle: below the joint's `straight` threshold is rest. */
  angle: number
  w: number
  h: number
  /** Visible enough and inside the frame, by the tracker's own rules. */
  seen: (i: number) => boolean
}

interface Measure {
  value: number | null
  note: string
  points: FormReading['points']
}

const limitOf = (fault: FormFault, t: PoseTuning): number =>
  ({ thigh_moving: t.thighMoveDeg, leaning_back: t.leanBackDeg, elbow_drifting: t.elbowDriftDeg, shrugging: t.shrugPct })[fault]

const deg = (rad: number) => (rad * 180) / Math.PI
const unit = (v: Vec): Vec => {
  const n = Math.hypot(v.x, v.y) || 1
  return { x: v.x / n, y: v.y / n }
}
/** Angle between two unit vectors, degrees. */
const between = (u: Vec, v: Vec) => deg(Math.acos(Math.min(1, Math.max(-1, u.x * v.x + u.y * v.y))))
const idle = (note: string, points: Measure['points']): Measure => ({ value: null, note, points })

export class FormCheck {
  private median = new Median3()
  private active = false
  // The opposite state trying to take over: since when, and for how many frames.
  private flipSince: number | null = null
  private flipFrames = 0
  // Rest references: which way the thigh pointed (knee), and the ear-to-shoulder gap in pixels (shoulder).
  private restDir: Vec | null = null
  private restGap: number | null = null
  private restFrames = 0

  /** New limb, or the limb was lost: forget the fault and the rest references. */
  reset() {
    this.median.reset()
    this.active = false
    this.flipSince = null
    this.flipFrames = 0
    this.restDir = null
    this.restGap = null
    this.restFrames = 0
  }

  /** One frame; `f` is null when the limb wasn't measured, which counts toward a fault clearing. */
  update(cfg: JointConfig, tuning: PoseTuning, t: number, f: FormFrame | null): FormReading | null {
    const fault = cfg.fault
    if (!fault || !tuning.formCheck) {
      this.reset()
      return null
    }
    const m = f ? this.measure(fault, cfg, tuning, f) : idle('Limb not measured', null)
    let value: number | null = null
    if (m.value == null) this.median.reset()
    else value = this.median.push(m.value)
    const limit = limitOf(fault, tuning)
    this.judge(value, limit, t, tuning.formHoldMs)
    return { fault, value, limit, unit: fault === 'shrugging' ? '%' : '°', active: this.active, note: m.note, points: m.points }
  }

  private judge(value: number | null, limit: number, t: number, holdMs: number) {
    const off = value != null && value > (this.active ? limit * OFF_RATIO : limit)
    if (off === this.active) {
      this.flipSince = null
      this.flipFrames = 0
      return
    }
    this.flipSince ??= t
    this.flipFrames += 1
    if (t - this.flipSince >= holdMs && this.flipFrames >= MIN_FRAMES) {
      this.active = off
      this.flipSince = null
      this.flipFrames = 0
    }
  }

  private measure(fault: FormFault, cfg: JointConfig, tuning: PoseTuning, f: FormFrame): Measure {
    const { lm, side, angle, seen } = f
    const px = (i: number): Vec => ({ x: lm[i].x * f.w, y: lm[i].y * f.h })
    const a = cfg.a[side]
    const j = cfg.joint[side]
    const b = cfg.b[side]
    const atRest = angle < cfg.straight

    switch (fault) {
      case 'thigh_moving': {
        // a = hip, j = knee.
        const points: Measure['points'] = [lm[a], lm[j]]
        if (!seen(a) || !seen(j)) return idle('Hip or knee not clearly seen', points)
        const hip = px(a)
        const knee = px(j)
        const dir = unit({ x: knee.x - hip.x, y: knee.y - hip.y })
        if (atRest) {
          // Averaged as a vector, not an angle, so a level thigh (±180°) doesn't wrap.
          const r = this.restDir
          this.restDir = r ? unit({ x: r.x + REST_WEIGHT * (dir.x - r.x), y: r.y + REST_WEIGHT * (dir.y - r.y) }) : dir
          this.restFrames += 1
          return idle('At rest: learning where the thigh lies', points)
        }
        if (!this.restDir || this.restFrames < REST_FRAMES) return idle('Waiting to see the leg straight', points)
        return { value: between(dir, this.restDir), note: 'Thigh turned from rest', points }
      }
      case 'leaning_back': {
        // a = shoulder, j = hip, b = knee.
        const points: Measure['points'] = [lm[j], lm[a]]
        if (!seen(a) || !seen(j) || !seen(b)) return idle('Shoulder, hip or knee not clearly seen', points)
        if (atRest) return idle('At rest', points)
        const shoulder = px(a)
        const hip = px(j)
        const knee = px(b)
        const ahead = knee.x - hip.x
        if (Math.abs(ahead) < MIN_FORWARD * Math.hypot(ahead, knee.y - hip.y)) return idle('Can’t tell which way is forward', points)
        // Positive with the shoulder behind the hip (away from the knee); leaning forward reads negative.
        const back = (shoulder.x - hip.x) * -Math.sign(ahead)
        return { value: deg(Math.atan2(back, hip.y - shoulder.y)), note: 'Trunk lean back from vertical', points }
      }
      case 'elbow_drifting': {
        // a = shoulder, j = elbow.
        const points: Measure['points'] = [lm[a], lm[j]]
        if (!seen(a) || !seen(j)) return idle('Shoulder or elbow not clearly seen', points)
        if (atRest) return idle('At rest', points)
        const shoulder = px(a)
        const elbow = px(j)
        return { value: Math.abs(deg(Math.atan2(elbow.x - shoulder.x, elbow.y - shoulder.y))), note: 'Upper arm off vertical', points }
      }
      case 'shrugging': {
        // j = shoulder; the ear on the same side.
        const ear = EAR[side]
        const points: Measure['points'] = [lm[j], lm[ear]]
        if (!seen(j) || !seen(ear)) return idle('Shoulder or ear not clearly seen', points)
        const gap = px(j).y - px(ear).y
        if (atRest) {
          if (gap > MIN_GAP * f.h) {
            this.restGap = this.restGap == null ? gap : this.restGap + REST_WEIGHT * (gap - this.restGap)
            this.restFrames += 1
          }
          return idle('At rest: learning the ear-to-shoulder gap', points)
        }
        if (angle > tuning.shrugMaxArm) return idle(`Arm above ${tuning.shrugMaxArm}°: not judged`, points)
        if (this.restGap == null || this.restFrames < REST_FRAMES) return idle('Waiting to see the arm at rest', points)
        return { value: (1 - gap / this.restGap) * 100, note: 'Ear-to-shoulder gap closed since rest', points }
      }
    }
  }
}

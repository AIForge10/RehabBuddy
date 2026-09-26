// Joint positions and helpers for the seated side-view figure. Stage space is
// 720 × 450 at roughly 2.9 units per cm, so a seated adult fits floor to crown
// with real proportions. The leg at 0° points straight out in front (+x);
// positive flexion swings the shin clockwise (down, then back under the chair).

export const HIP = { x: 310, y: 270 }
export const KNEE = { x: 430, y: 270 }
export const SHOULDER = { x: 299, y: 124 }
/** Knee joint to ankle joint. */
export const SHIN = 120
/** Ankle joint to the bottom of the shoe. */
export const ANKLE_H = 20
/** The foot rests flat on the floor at 90°. */
export const FLOOR_Y = KNEE.y + SHIN + ANKLE_H
export const MAX_FLEX = 135

export type P = readonly [number, number]

const rad = (deg: number) => (deg * Math.PI) / 180

/** Rotate a point about the knee by `deg` (clockwise, y-down). */
export function spin([x, y]: P, deg: number): P {
  if (!deg) return [x, y]
  const c = Math.cos(rad(deg))
  const s = Math.sin(rad(deg))
  const dx = x - KNEE.x
  const dy = y - KNEE.y
  return [KNEE.x + dx * c - dy * s, KNEE.y + dx * s + dy * c]
}

/** A point fixed to the shin: `u` along it from the knee, `v` across it (+ = calf side), measured at 0°. */
function onShin(u: number, v: number, deg: number) {
  const [x, y] = spin([KNEE.x + u, KNEE.y + v], deg)
  return { x, y }
}

export const ankleAt = (deg: number) => onShin(SHIN, 0, deg)

/** Toe tip, where pose models put the "foot index" landmark. */
export const toeAt = (deg: number) => onShin(SHIN + 14, -48, deg)

/** Middle of the sole, for the contact shadow. */
export const soleAt = (deg: number) => onShin(SHIN + ANKLE_H, -20, deg)

// ---- Rig ----
// The figure is a puppet: every limb segment is drawn once in a reference pose
// and turned about its joint, the way the shin already turns about the knee.
// Nesting the turns (shoulder → elbow → wrist, hip → knee) is forward
// kinematics, so any exercise is just a set of joint angles. SeatedBody nests
// the same rotations as SVG transforms; jointsAt() applies them to points.

/**
 * Joint angles in degrees. `hip` lifts the thigh off the seat; `knee` bends
 * the shin back from straight out; `shoulder` swings the arm forward from
 * hanging straight down; `elbow` bends the forearm forward from straight;
 * `wrist` tips the hand toward its back (extension, for a palm-down hand).
 */
export interface Pose {
  hip: number
  knee: number
  shoulder: number
  elbow: number
  wrist: number
}

/** Leg straight out, hand resting on the thigh: the knee exercise's start. */
export const REST_POSE: Pose = { hip: 0, knee: 0, shoulder: 4, elbow: 58, wrist: 15 }

export const UPPER_ARM = 84
export const FOREARM = 70
/** Wrist to fingertip. */
export const HAND = 50

// Arm joints in the reference pose, with the arm hanging straight down.
export const ELBOW = { x: SHOULDER.x, y: SHOULDER.y + UPPER_ARM }
export const WRIST = { x: SHOULDER.x, y: ELBOW.y + FOREARM }
const FINGER = { x: SHOULDER.x, y: WRIST.y + HAND }
const ANKLE = { x: KNEE.x + SHIN, y: KNEE.y }
const TOE = { x: KNEE.x + SHIN + 14, y: KNEE.y - 48 }

/** How far the trunk leans forward from vertical, shoulder to hip. */
export const TRUNK = (Math.atan2(HIP.x - SHOULDER.x, HIP.y - SHOULDER.y) * 180) / Math.PI

type Pt = { x: number; y: number }

/** Rotate `p` about `c` by `deg`, clockwise on screen, like SVG rotate(). */
function turn(p: Pt, c: Pt, deg: number): Pt {
  const [x, y] = [p.x - c.x, p.y - c.y]
  const cos = Math.cos(rad(deg))
  const sin = Math.sin(rad(deg))
  return { x: c.x + x * cos - y * sin, y: c.y + x * sin + y * cos }
}

/** A point drawn on the shin (leg straight out), carried by the knee and hip. */
export const shinPoint = (pose: Pose, p: Pt) => turn(turn(p, KNEE, pose.knee), HIP, -pose.hip)

export type Joint = 'shoulder' | 'elbow' | 'wrist' | 'finger' | 'hip' | 'knee' | 'ankle' | 'toe'

/** Where each joint lands in `pose`. `finger` is the fingertip, `toe` the shoe's toe. */
export function jointsAt(pose: Pose): Record<Joint, Pt> {
  const shoulder = (p: Pt) => turn(p, SHOULDER, -pose.shoulder)
  const elbow = (p: Pt) => shoulder(turn(p, ELBOW, -pose.elbow))
  const wrist = (p: Pt) => elbow(turn(p, WRIST, -pose.wrist))
  return {
    shoulder: SHOULDER,
    elbow: shoulder(ELBOW),
    wrist: elbow(WRIST),
    finger: wrist(FINGER),
    hip: HIP,
    knee: turn(KNEE, HIP, -pose.hip),
    ankle: shinPoint(pose, ANKLE),
    toe: shinPoint(pose, TOE),
  }
}

/** The angle at `b` between `a` and `c`, in degrees (0–180): what the pose tracker measures. */
export function angleAt(a: Pt, b: Pt, c: Pt) {
  const u = Math.atan2(a.y - b.y, a.x - b.x)
  const v = Math.atan2(c.y - b.y, c.x - b.x)
  const d = Math.abs(((u - v) * 180) / Math.PI) % 360
  return d > 180 ? 360 - d : d
}

// Satyabrata — angle math. SAME as angle_at / joint_angle in ml/angle_prototype.py.
import type { JointConfig } from './joints'

export type Point = { x: number; y: number }

/** Raw angle theta at point j, in degrees (0–180). */
export function angleAt(a: Point, j: Point, b: Point): number {
  const ja = { x: a.x - j.x, y: a.y - j.y }
  const jb = { x: b.x - j.x, y: b.y - j.y }
  const mag = Math.hypot(ja.x, ja.y) * Math.hypot(jb.x, jb.y)
  if (mag === 0) return 0
  const cos = Math.min(1, Math.max(-1, (ja.x * jb.x + ja.y * jb.y) / mag))
  return (Math.acos(cos) * 180) / Math.PI
}

/** Angle in the joint's convention (flexion: straight = 0; raw: theta). */
export function jointAngle(cfg: JointConfig, a: Point, j: Point, b: Point): number {
  const theta = angleAt(a, j, b)
  return cfg.mode === 'flexion' ? 180 - theta : theta
}

/** Kept for existing code: knee flexion = 180 - theta. */
export function kneeFlexion(hip: Point, knee: Point, ankle: Point): number {
  return 180 - angleAt(hip, knee, ankle)
}

// Moving average over the last N frames to stop jitter.
export class Smoother {
  private buf: number[] = []
  private size: number
  constructor(size = 5) {
    this.size = size
  }
  push(v: number): number {
    this.buf.push(v)
    if (this.buf.length > this.size) this.buf.shift()
    return this.buf.reduce((a, b) => a + b, 0) / this.buf.length
  }
}

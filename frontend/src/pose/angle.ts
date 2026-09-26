// angle math. SAME as angle_at / joint_angle in ml/angle_prototype.py.
//
// MediaPipe's normalized landmarks divide x by the frame WIDTH and y by the
// frame HEIGHT, so on a 16:9 camera one unit of x is 1.8x longer than one unit
// of y. Measure angles on pixels (toPixels), never on the raw 0–1 values:
// on 16:9, a true 45° shoulder raise reads ~29° from normalized coordinates.
import type { JointConfig } from './joints'

export type Point = { x: number; y: number }
export type Point3 = { x: number; y: number; z: number }

/** Raw angle theta at point j, in degrees (0–180). */
export function angleAt(a: Point, j: Point, b: Point): number {
  const ja = { x: a.x - j.x, y: a.y - j.y }
  const jb = { x: b.x - j.x, y: b.y - j.y }
  const mag = Math.hypot(ja.x, ja.y) * Math.hypot(jb.x, jb.y)
  if (mag === 0) return 0
  const cos = Math.min(1, Math.max(-1, (ja.x * jb.x + ja.y * jb.y) / mag))
  return (Math.acos(cos) * 180) / Math.PI
}

/** Same as angleAt, in 3D (for MediaPipe's world landmarks, in meters). */
export function angleAt3d(a: Point3, j: Point3, b: Point3): number {
  const ja = { x: a.x - j.x, y: a.y - j.y, z: a.z - j.z }
  const jb = { x: b.x - j.x, y: b.y - j.y, z: b.z - j.z }
  const mag = Math.hypot(ja.x, ja.y, ja.z) * Math.hypot(jb.x, jb.y, jb.z)
  if (mag === 0) return 0
  const cos = Math.min(1, Math.max(-1, (ja.x * jb.x + ja.y * jb.y + ja.z * jb.z) / mag))
  return (Math.acos(cos) * 180) / Math.PI
}

/** A normalized landmark in pixels of a w × h frame. */
export function toPixels(p: Point, w: number, h: number): Point {
  return { x: p.x * w, y: p.y * h }
}

/** theta in the joint's convention (flexion: straight = 0; raw: theta). */
export function reading(cfg: JointConfig, theta: number): number {
  return cfg.mode === 'flexion' ? 180 - theta : theta
}

/** Angle in the joint's convention. Pass pixel coordinates (see toPixels). */
export function jointAngle(cfg: JointConfig, a: Point, j: Point, b: Point): number {
  return reading(cfg, angleAt(a, j, b))
}

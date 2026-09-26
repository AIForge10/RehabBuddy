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

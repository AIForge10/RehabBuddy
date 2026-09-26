// The camera-setup checks as pure functions of what the camera sees, so they
// can be tested without one. useSetupChecks feeds them the setup preview a few
// times a second and decides when a reading has held long enough to count.
//
//   placement  side-on to the camera?        the shoulders and the hips line up
//   framing    the measured joints in view?  the tracker's own rule for "seen"
//   light      bright, and not backlit?      the luminance of a thumbnail of the frame
import { JOINTS, type JointName } from '../pose/joints'
import { DEFAULT_TUNING } from '../pose/tracker'

/** A MediaPipe landmark: x over the frame's width, y over its height. */
export interface Mark {
  x: number
  y: number
  visibility?: number
}

// "Seen" means what it means to the tracker (tracker.ts): visible enough, and
// inside the frame give or take its margin (FRAME_MARGIN there, not exported).
// Setup ticking a joint then means the session can measure it.
const MIN_VISIBILITY = DEFAULT_TUNING.minVisibility
const FRAME_MARGIN = 0.05

const offSide = (p: Mark) => p.x < -FRAME_MARGIN || p.x > 1 + FRAME_MARGIN
const offEnd = (p: Mark) => p.y < -FRAME_MARGIN || p.y > 1 + FRAME_MARGIN
const inFrame = (p: Mark) => !offSide(p) && !offEnd(p)
export const seen = (p: Mark | undefined): p is Mark => p != null && (p.visibility ?? 0) >= MIN_VISIBILITY && inFrame(p)

/** Nose, arms and legs: the points that say where the person is, without the small hand and foot ones. */
export const BODY = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28] as const

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ---- Framing ---------------------------------------------------------------

/** How to bring a missing joint into view: step back (off the top or bottom), move over (off a side), or clear the way (in frame, but hidden). */
export type Fix = 'back' | 'center' | 'clear'

/** `joint` indexes the exercise's measured points: 0 proximal, 1 vertex, 2 distal (its `copy.joints`). */
export type Framing = { status: 'ok' } | { status: 'nobody' } | { status: 'missing'; joint: 0 | 1 | 2; fix: Fix }

export interface FramingRead {
  framing: Framing
  /** The measured points on whichever side is more in view, for drawing; null when nobody's there. */
  points: readonly [Mark, Mark, Mark] | null
  seen: readonly [boolean, boolean, boolean]
}

export function readFraming(lm: readonly Mark[] | null, part: JointName): FramingRead {
  if (!lm?.length) return { framing: { status: 'nobody' }, points: null, seen: [false, false, false] }
  const { a, joint, b } = JOINTS[part]
  const side = (s: 0 | 1) => [lm[a[s]], lm[joint[s]], lm[b[s]]] as const
  // The tracker measures whichever side it sees; so this goes by the better one:
  // most points seen, then the best-seen weakest point.
  const score = (pts: readonly Mark[]) => pts.filter(seen).length + Math.min(...pts.map((p) => p.visibility ?? 0))
  const points = score(side(0)) >= score(side(1)) ? side(0) : side(1)
  const ok = [seen(points[0]), seen(points[1]), seen(points[2])] as const
  if (ok.every(Boolean)) return { framing: { status: 'ok' }, points, seen: ok }

  // Name one missing joint: one off the frame first (moving fixes that), else the least visible.
  const order = ([0, 1, 2] as const).filter((i) => !ok[i])
  const off = order.find((i) => !inFrame(points[i]))
  const i = off ?? order.reduce((m, i) => ((points[i].visibility ?? 0) < (points[m].visibility ?? 0) ? i : m))
  const p = points[i]
  const fix: Fix = off == null ? 'clear' : offEnd(p) ? 'back' : 'center'
  return { framing: { status: 'missing', joint: i, fix }, points, seen: ok }
}

// ---- Placement ---------------------------------------------------------------

export type Placement = 'ok' | 'turn'

// Facing the camera, the shoulders sit about this share of the body's longest
// segment apart, and the hips (MediaPipe's hip points are the joints, closer in)
// this share. Side-on, each pair closes up to nearly one point.
const SPANS = [
  { pair: [11, 12], width: 0.8 },
  { pair: [23, 24], width: 0.55 },
] as const
// Torso, thigh, shin and upper arm: the longest one in view sets the body's size
// in the image, whichever way they face. (Foreshortened ones just lose to the others.)
const SEGMENTS = [[11, 23], [12, 24], [23, 25], [24, 26], [25, 27], [26, 28], [11, 13], [12, 14]] as const
// Turned further than this from side-on, a bend reads a few degrees off in the
// image: a 45° knee bend reads about 49° at 30°.
const MAX_TURN_DEG = 30

/**
 * Every exercise here is filmed side-on (see its setup copy). Side-on, the
 * shoulders overlap horizontally, and so do the hips; the more they spread, the
 * further the person has turned toward the camera. Null when it can't tell:
 * nobody there, or neither pair in view.
 */
export function readPlacement(lm: readonly Mark[] | null, w: number, h: number): Placement | null {
  const turn = turnFromSide(lm, w, h)
  return turn == null ? null : turn <= MAX_TURN_DEG ? 'ok' : 'turn'
}

/** Estimated turn away from side-on, in degrees (0 = side-on, 90 = facing the camera). */
export function turnFromSide(lm: readonly Mark[] | null, w: number, h: number): number | null {
  if (!lm?.length) return null
  const length = ([i, j]: readonly [number, number]) => Math.hypot((lm[i].x - lm[j].x) * w, (lm[i].y - lm[j].y) * h)
  const scale = Math.max(0, ...SEGMENTS.filter(([i, j]) => seen(lm[i]) && seen(lm[j])).map(length))
  if (!scale) return null
  // Side-on the far shoulder or hip is hidden, so one of each pair seen is enough;
  // the other only has to be somewhere in the frame.
  const turns = SPANS.filter(({ pair: [l, r] }) => (seen(lm[l]) || seen(lm[r])) && inFrame(lm[l]) && inFrame(lm[r])).map(
    ({ pair: [l, r], width }) => Math.asin(Math.min(1, (Math.abs(lm[l].x - lm[r].x) * w) / (scale * width))),
  )
  if (!turns.length) return null
  return ((turns.reduce((s, t) => s + t, 0) / turns.length) * 180) / Math.PI
}

// ---- Light -------------------------------------------------------------------

export type LightReading = 'ok' | 'dark' | 'backlit'

export interface LightSample {
  /** Mean luma of the frame, 0–255. */
  mean: number
  /** Share of the frame that's blown out. */
  blown: number
  /** Median luma at the person's body landmarks; null when nobody's in view. */
  subject: number | null
}

// A webcam brightens a dim room on its own, so a frame that still averages
// below this means it has run out of room to: the room is too dark.
const DARK = 60
// A blown-out patch this big is a window or a lamp in view, not a highlight.
const BLOWN = 245
const BLOWN_SHARE = 0.1
// With one in view, a person reading under this share of the frame's average is silhouetted.
const BACKLIT = 0.5
// Patch radius at each landmark, in thumbnail pixels: a 3 × 3 patch on a
// 128-wide thumbnail is about a limb's width at 2 m, so it samples the person,
// not the room behind them.
const PATCH = 1

// Rec. 709 luma straight off the sRGB values: near enough to tell bright from dark.
const luma = (d: ArrayLike<number>, i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]

/** `rgba` is a w × h thumbnail of the frame (ImageData.data); `body` the person's landmarks that are seen. */
export function measureLight(rgba: ArrayLike<number>, w: number, h: number, body: readonly Mark[]): LightSample {
  let sum = 0
  let blown = 0
  for (let i = 0; i < w * h * 4; i += 4) {
    const y = luma(rgba, i)
    sum += y
    if (y >= BLOWN) blown++
  }
  const patches = body.map((p) => {
    const cx = Math.min(w - 1, Math.max(0, Math.round(p.x * (w - 1))))
    const cy = Math.min(h - 1, Math.max(0, Math.round(p.y * (h - 1))))
    let s = 0
    let n = 0
    for (let y = Math.max(0, cy - PATCH); y <= Math.min(h - 1, cy + PATCH); y++)
      for (let x = Math.max(0, cx - PATCH); x <= Math.min(w - 1, cx + PATCH); x++) {
        s += luma(rgba, (y * w + x) * 4)
        n++
      }
    return s / n
  })
  // Median, so a patch or two that lands on the background doesn't count.
  return { mean: sum / (w * h), blown: blown / (w * h), subject: patches.length ? median(patches) : null }
}

/** Null when it can't tell: a bright light in view, and nobody in front of it to judge by. */
export function readLight({ mean, blown, subject }: LightSample): LightReading | null {
  if (mean < DARK) return 'dark'
  if (blown < BLOWN_SHARE) return 'ok'
  // A bright window only matters if it's behind them. Dark clothes against a white
  // wall read dark too, which is why this needs the blown-out light as well.
  if (subject == null) return null
  return subject < BACKLIT * mean ? 'backlit' : 'ok'
}

// ---- Holding still, and holding steady ---------------------------------------

/** How fast the person is moving, in frame diagonals a second (median over the body points seen in both frames); null if none are. */
export function speed(prev: readonly Mark[], cur: readonly Mark[], w: number, h: number, dtMs: number): number | null {
  if (dtMs <= 0) return null
  const diag = Math.hypot(w, h)
  const moved = BODY.filter((i) => seen(prev[i]) && seen(cur[i])).map(
    (i) => Math.hypot((cur[i].x - prev[i].x) * w, (cur[i].y - prev[i].y) * h) / diag,
  )
  return moved.length ? (median(moved) * 1000) / dtMs : null
}

export interface Sample<T> {
  t: number
  value: T
}

export const STEADY_MS = 1000
const STEADY_SHARE = 0.8

/**
 * The reading that held for most of the last second (at least STEADY_SHARE of
 * the samples), or undefined while they're mixed or there's under most of a
 * second of them. One stray frame neither ticks a check nor flips its hint.
 */
export function settled<T>(samples: readonly Sample<T>[], now: number): T | undefined {
  const recent = samples.filter((s) => now - s.t <= STEADY_MS)
  if (!recent.length || now - recent[0].t < STEADY_MS * 0.7) return undefined
  const counts = new Map<string, { value: T; n: number }>()
  for (const { value } of recent) {
    const key = String(JSON.stringify(value))
    const c = counts.get(key)
    if (c) c.n++
    else counts.set(key, { value, n: 1 })
  }
  for (const { value, n } of counts.values()) if (n >= STEADY_SHARE * recent.length) return value
  return undefined
}

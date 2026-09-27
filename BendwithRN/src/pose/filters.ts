// Angle smoothing. Replaces the old 5-frame moving average, which lagged every
// movement by the same ~70 ms yet still let single-frame glitches through.

/**
 * One Euro filter (Casiez et al., CHI 2012): a low-pass whose cutoff opens up
 * with speed. Holding still, it smooths hard (no jitter); moving, it barely
 * smooths (no lag).
 *   minCutoff (Hz): lower = steadier at rest.
 *   beta: how fast the cutoff opens with speed (per °/s here). Higher = less lag.
 */
export class OneEuroFilter {
  minCutoff: number
  beta: number
  dCutoff: number
  private x: number | null = null
  private dx = 0
  private t = 0

  constructor(minCutoff = 1, beta = 0.1, dCutoff = 1) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
  }

  filter(value: number, tMs: number): number {
    if (this.x == null) {
      this.x = value
      this.dx = 0
      this.t = tMs
      return value
    }
    const dt = Math.max((tMs - this.t) / 1000, 1e-3)
    this.t = tMs
    this.dx += smoothing(this.dCutoff, dt) * ((value - this.x) / dt - this.dx)
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx)
    this.x += smoothing(cutoff, dt) * (value - this.x)
    return this.x
  }

  reset() {
    this.x = null
  }
}

function smoothing(cutoffHz: number, dt: number) {
  const tau = 1 / (2 * Math.PI * cutoffHz)
  return 1 / (1 + tau / dt)
}

/** Median of the last 3 values: drops one-frame spikes for one frame of delay. */
export class Median3 {
  private buf: number[] = []

  push(v: number): number {
    this.buf.push(v)
    if (this.buf.length > 3) this.buf.shift()
    if (this.buf.length < 3) return v
    const [a, b, c] = this.buf
    return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c))
  }

  reset() {
    this.buf = []
  }
}

/**
 * One Euro filter on every landmark's x, y and z, before any angle is measured.
 * The angle filter above steadies one number; this steadies the points the
 * overlay draws and every measure is taken from, so a jittery hand doesn't
 * flicker on screen or fake a bend. Coordinates are filtered in units of the
 * frame diagonal, so the speed term (beta, per diagonal/s) means the same thing
 * on any camera. A point that isn't seen passes through untouched and forgets
 * its filter, so it snaps to where it is when it comes back rather than gliding
 * there from a stale place.
 */
export class LandmarkSmoother {
  minCutoff: number
  beta: number
  private filters: [OneEuroFilter, OneEuroFilter, OneEuroFilter][] = []

  constructor(minCutoff = 1, beta = 20) {
    this.minCutoff = minCutoff
    this.beta = beta
  }

  setParams(minCutoff: number, beta: number) {
    this.minCutoff = minCutoff
    this.beta = beta
    for (const f of this.filters) for (const axis of f) (axis.minCutoff = minCutoff), (axis.beta = beta)
  }

  apply<P extends { x: number; y: number; z: number; visibility?: number }>(pts: P[], w: number, h: number, tMs: number, minVisibility: number): P[] {
    const diag = Math.hypot(w, h) || 1
    const sx = w / diag
    const sy = h / diag
    return pts.map((p, i) => {
      const f = (this.filters[i] ??= [this.make(), this.make(), this.make()])
      if (p.visibility != null && p.visibility < minVisibility) {
        for (const axis of f) axis.reset()
        return p
      }
      // z is on x's scale for MediaPipe's normalized landmarks.
      return { ...p, x: f[0].filter(p.x * sx, tMs) / sx, y: f[1].filter(p.y * sy, tMs) / sy, z: f[2].filter(p.z * sx, tMs) / sx }
    })
  }

  reset() {
    this.filters = []
  }

  private make() {
    return new OneEuroFilter(this.minCutoff, this.beta)
  }
}

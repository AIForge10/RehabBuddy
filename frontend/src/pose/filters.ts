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

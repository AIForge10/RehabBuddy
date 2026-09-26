// rep counting with hysteresis, glitch rejection, and form checks.
// Flexion convention: 0° = straight leg / arm at side, bigger = deeper flexion.
export interface RepCounterConfig {
  bentThreshold: number     // rep "starts" when flexion goes above this
  straightThreshold: number // rep "finishes" when flexion drops back below this
  targetAngle: number       // therapist's target, e.g. 90
  minRepMs: number          // faster than this = "too fast" form warning (e.g. 1200ms)
  minValidMs: number        // faster than this = camera glitch / noise spike, REJECTED (e.g. 450ms)
  debounceMs: number        // wait time after finishing rep before starting a new one (e.g. 350ms)
}

export type RepEvent =
  | { type: 'rep'; count: number; peak: number; warnings: string[] }
  | { type: 'none' }

export class RepCounter {
  count = 0
  maxAngle = 0
  warnings: string[] = []
  private bent = false
  get isBent() {
    return this.bent
  }
  private repPeak = 0
  private repStart = 0
  private lastRepFinish = 0
  private bentFrames = 0
  private cfg: RepCounterConfig

  constructor(cfg: Partial<RepCounterConfig> = {}) {
    this.cfg = {
      bentThreshold: 45,
      straightThreshold: 20,
      targetAngle: 90,
      minRepMs: 1200,
      minValidMs: 450,
      debounceMs: 350,
      ...cfg,
    }
  }

  update(angle: number, nowMs: number): RepEvent {
    this.maxAngle = Math.max(this.maxAngle, angle)

    if (!this.bent) {
      if (angle > this.cfg.bentThreshold) {
        // Enforce debounce cooldown between consecutive reps
        if (nowMs - this.lastRepFinish < this.cfg.debounceMs) {
          return { type: 'none' }
        }
        // Require 2 consecutive frames above threshold to filter out 1-frame camera noise spikes
        this.bentFrames += 1
        if (this.bentFrames >= 2) {
          this.bent = true
          this.repPeak = angle
          this.repStart = nowMs
        }
      } else {
        this.bentFrames = 0
      }
    } else if (this.bent) {
      this.repPeak = Math.max(this.repPeak, angle)
      if (angle < this.cfg.straightThreshold) {
        const duration = nowMs - this.repStart
        this.bent = false
        this.bentFrames = 0
        this.lastRepFinish = nowMs

        // Reject camera glitches / rapid side swaps under minValidMs
        if (duration < this.cfg.minValidMs) {
          return { type: 'none' }
        }

        this.count += 1
        const repWarnings: string[] = []
        if (this.repPeak < this.cfg.targetAngle - 10) repWarnings.push('not_deep_enough')
        if (duration < this.cfg.minRepMs) repWarnings.push('too_fast')
        this.warnings.push(...repWarnings)
        return { type: 'rep', count: this.count, peak: this.repPeak, warnings: repWarnings }
      }
    }
    return { type: 'none' }
  }

  reset() {
    this.count = 0
    this.maxAngle = 0
    this.warnings = []
    this.bent = false
    this.repPeak = 0
    this.repStart = 0
    this.lastRepFinish = 0
    this.bentFrames = 0
  }
}

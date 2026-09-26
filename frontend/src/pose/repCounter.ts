// rep counting with hysteresis + form checks.
// Flexion convention: 0° = straight leg, bigger = more bent.
export interface RepCounterConfig {
  bentThreshold: number     // rep "starts" when flexion goes above this
  straightThreshold: number // rep "finishes" when flexion drops back below this
  targetAngle: number       // therapist's target, e.g. 90
  minRepMs: number          // faster than this = "too fast"
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
  private cfg: RepCounterConfig

  constructor(cfg: Partial<RepCounterConfig> = {}) {
    this.cfg = { bentThreshold: 45, straightThreshold: 20, targetAngle: 90, minRepMs: 1200, ...cfg }
  }

  update(angle: number, nowMs: number): RepEvent {
    this.maxAngle = Math.max(this.maxAngle, angle)

    if (!this.bent && angle > this.cfg.bentThreshold) {
      this.bent = true
      this.repPeak = angle
      this.repStart = nowMs
    } else if (this.bent) {
      this.repPeak = Math.max(this.repPeak, angle)
      if (angle < this.cfg.straightThreshold) {
        this.bent = false
        this.count += 1
        const repWarnings: string[] = []
        if (this.repPeak < this.cfg.targetAngle - 10) repWarnings.push('not_deep_enough')
        if (nowMs - this.repStart < this.cfg.minRepMs) repWarnings.push('too_fast')
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
  }
}

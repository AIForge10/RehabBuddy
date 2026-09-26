// rep counting with hysteresis, glitch rejection, and form checks.
// Flexion convention: 0° = straight leg / arm at side, bigger = deeper flexion.
//
// The thresholds are set for the joint's start position. A limb that starts
// straight rests near 0°, so `bentThreshold` and `straightThreshold` are plain
// readings. A joint that starts bent gives `restAngle` instead: the seated hip
// reads about 86° before the knee lifts (lib/exercises.ts HIP_SEATED), and a rep
// there has to finish with the foot back on the floor, not at 0°, which only
// standing up reaches. For such a joint the whole band follows the rest reading
// the counter sees, so sitting a little slouched or a little forward moves the
// band along with the patient rather than putting the rest inside it.
export interface RepCounterConfig {
  bentThreshold: number     // rep "starts" when flexion goes above this
  straightThreshold: number // rep "finishes" when flexion drops back below this
  restAngle: number         // reading at the start position; 0 for a limb that starts straight
  targetAngle: number       // therapist's target, e.g. 90
  minRepMs: number          // faster than this = "too fast" form warning (e.g. 1200ms)
  minValidMs: number        // faster than this = camera glitch / noise spike, REJECTED (e.g. 450ms)
  debounceMs: number        // wait time after finishing rep before starting a new one (e.g. 350ms)
}

/** Saved with the session as these codes (lib/formWarnings.ts turns them into words). */
export type RepWarning = 'not_deep_enough' | 'too_fast'

export type RepEvent =
  | { type: 'rep'; count: number; peak: number; warnings: RepWarning[] }
  | { type: 'none' }

// Following the rest reading (restAngle > 0 only): the first frames lock on
// quickly, since the session opens at rest; after that it drifts slowly, and
// only toward readings near rest, so a lift under way can't pull the band up
// after it. It never strays further than REST_DRIFT from the configured rest.
const REST_LOCK_FRAMES = 15
const REST_LOCK_WEIGHT = 0.2
const REST_WEIGHT = 0.02
const REST_DRIFT = 25

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export class RepCounter {
  count = 0
  maxAngle = 0
  warnings: RepWarning[] = []
  private bent = false
  get isBent() {
    return this.bent
  }
  private repPeak = 0
  private repStart = 0
  private lastRepFinish = 0
  private bentFrames = 0
  /** The rest reading seen so far, for a joint with a restAngle; null until the first frame. */
  private rest: number | null = null
  private restFrames = 0
  private cfg: RepCounterConfig

  constructor(cfg: Partial<RepCounterConfig> = {}) {
    this.cfg = {
      bentThreshold: 45,
      straightThreshold: 20,
      restAngle: 0,
      targetAngle: 90,
      minRepMs: 1200,
      minValidMs: 450,
      debounceMs: 350,
      ...cfg,
    }
  }

  /** Where the band sits right now: the configured thresholds, shifted by how far the seen rest is from `restAngle`. */
  get thresholds(): { bent: number; straight: number } {
    const shift = this.rest == null ? 0 : this.rest - this.cfg.restAngle
    return { bent: this.cfg.bentThreshold + shift, straight: this.cfg.straightThreshold + shift }
  }

  private learnRest(angle: number) {
    if (this.cfg.restAngle <= 0) return
    if (this.rest == null) {
      this.rest = angle
      this.restFrames = 1
      return
    }
    const settling = this.restFrames < REST_LOCK_FRAMES
    // Past the lock-on, only readings in the lower half of the rest-to-straight gap count as rest.
    const nearRest = angle <= this.rest + (this.cfg.straightThreshold - this.cfg.restAngle) / 2
    if (!settling && !nearRest) return
    const w = settling ? REST_LOCK_WEIGHT : REST_WEIGHT
    this.rest = clamp(this.rest + w * (angle - this.rest), this.cfg.restAngle - REST_DRIFT, this.cfg.restAngle + REST_DRIFT)
    this.restFrames += 1
  }

  update(angle: number, nowMs: number): RepEvent {
    this.maxAngle = Math.max(this.maxAngle, angle)
    if (!this.bent) this.learnRest(angle)
    const { bent: bentAt, straight: straightAt } = this.thresholds

    if (!this.bent) {
      if (angle > bentAt) {
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
      if (angle < straightAt) {
        const duration = nowMs - this.repStart
        this.bent = false
        this.bentFrames = 0
        this.lastRepFinish = nowMs

        // Reject camera glitches / rapid side swaps under minValidMs
        if (duration < this.cfg.minValidMs) {
          return { type: 'none' }
        }

        this.count += 1
        const repWarnings: RepWarning[] = []
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
    this.rest = null
    this.restFrames = 0
  }
}

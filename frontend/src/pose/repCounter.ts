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
// band along with the patient rather than putting the rest inside it. The
// target moves with it too: "lift to 115°" means 29° above wherever they sit.
//
// For such a joint a rep also ends wherever the limb comes to rest below the
// top of the lift, even above the finish line: a patient who leans forward to lift and then
// sits that way (a dozen degrees of hip flexion) used to be stuck mid-rep
// until they stood up. The rest is then re-learned from where they settled.
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
// quickly, since the session opens at rest. After that a lower reading is taken
// up fast (the band only gets easier to leave, and single-frame dips are already
// filtered upstream), a slightly higher one slowly, and a reading well above
// rest not at all, so a lift under way can't pull the band up after it. It
// never strays further than REST_DRIFT from the configured rest.
const REST_LOCK_FRAMES = 15
const REST_LOCK_WEIGHT = 0.2
const REST_DOWN_WEIGHT = 0.1
const REST_UP_WEIGHT = 0.02
const REST_DRIFT = 30

// Mid-rep, the limb has come to rest once it has stayed within SETTLE_RANGE for
// SETTLE_MS while at least SETTLE_BELOW_PEAK under the rep's peak (a hold at the
// top is still, but at the top).
const SETTLE_MS = 800
const SETTLE_RANGE = 4
const SETTLE_BELOW_PEAK = 10

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
  /** Mid-rep: since when, and between what, the reading has held still. */
  private settle: { since: number; low: number; high: number } | null = null
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

  /** How far the seen rest is from the configured one (0 for a joint without a restAngle). */
  private get shift(): number {
    return this.rest == null ? 0 : this.rest - this.cfg.restAngle
  }

  /** Where the band sits right now: the configured thresholds, shifted by how far the seen rest is from `restAngle`. */
  get thresholds(): { bent: number; straight: number } {
    return { bent: this.cfg.bentThreshold + this.shift, straight: this.cfg.straightThreshold + this.shift }
  }

  /** The target as it applies to the seen rest: the same lift above it that the therapist's target is above `restAngle`. */
  get target(): number {
    return this.cfg.targetAngle + this.shift
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
    const w = settling ? REST_LOCK_WEIGHT : angle < this.rest ? REST_DOWN_WEIGHT : REST_UP_WEIGHT
    this.rest = clamp(this.rest + w * (angle - this.rest), this.cfg.restAngle - REST_DRIFT, this.cfg.restAngle + REST_DRIFT)
    this.restFrames += 1
  }

  /** Mid-rep: true once the reading has held still below the peak long enough to count as the limb at rest. */
  private settled(angle: number, nowMs: number): boolean {
    const s = this.settle
    if (!s || angle < s.low - SETTLE_RANGE || angle > s.high + SETTLE_RANGE || this.repPeak - angle < SETTLE_BELOW_PEAK) {
      this.settle = { since: nowMs, low: angle, high: angle }
      return false
    }
    s.low = Math.min(s.low, angle)
    s.high = Math.max(s.high, angle)
    if (s.high - s.low > SETTLE_RANGE) {
      this.settle = { since: nowMs, low: angle, high: angle }
      return false
    }
    return nowMs - s.since >= SETTLE_MS
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
          this.settle = null
        }
      } else {
        this.bentFrames = 0
      }
    } else if (this.bent) {
      this.repPeak = Math.max(this.repPeak, angle)
      const back = angle < straightAt
      // Coming to rest mid-lift ends a rep only for a joint that starts bent (the seated hip). A limb
      // that starts straight has somewhere to go back to, and stopping short of it is a hold: a knee
      // held at 88° after a 100° peak would otherwise count once there and again on the way down.
      if (back || (this.cfg.restAngle > 0 && this.settled(angle, nowMs))) {
        const duration = nowMs - this.repStart
        // Judged against the rest the rep started from, before any new one is learned below.
        const deepEnough = this.repPeak >= this.target - 10
        this.bent = false
        this.bentFrames = 0
        this.lastRepFinish = nowMs
        // Came to rest above the finish line: that's where they sit now.
        if (!back && this.cfg.restAngle > 0 && this.settle) {
          this.rest = clamp((this.settle.low + this.settle.high) / 2, this.cfg.restAngle - REST_DRIFT, this.cfg.restAngle + REST_DRIFT)
        }
        this.settle = null

        // Reject camera glitches / rapid side swaps under minValidMs
        if (duration < this.cfg.minValidMs) {
          return { type: 'none' }
        }

        this.count += 1
        const repWarnings: RepWarning[] = []
        if (!deepEnough) repWarnings.push('not_deep_enough')
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
    this.settle = null
  }
}

// Accuracy validation for /pose-debug: hold a pose, measure the joint by hand
// (goniometer, phone inclinometer, printed protractor), type that in, and the
// page records what the tracker read over the same second. The stats here turn
// those trials into the numbers for the slide.
//
// Pure functions and type-only imports, so node can run this file as is to
// check the math (no React, no DOM, except the two localStorage helpers at the end).
import type { JointName } from '../joints'
import type { TrackFrame } from '../tracker'

/** A capture reads the last second of frames. */
export const HOLD_MS = 1000
/** ...and needs most of it, so pressing Enter the moment the camera starts isn't a 3-frame reading. */
const MIN_SPAN_MS = 800
/** The filtered angle may wander this far (max − min) over that second and still count as held still. */
export const STEADY_DEG = 3
/** One of the three points was barely seen (the tracker's default min visibility). */
const LOW_CONFIDENCE = 0.5
/** The newest frame is older than this: the video stopped (paused clip, camera gone). */
const STALE_MS = 250

type Side = 'left' | 'right'
type Sample = Pick<TrackFrame, 'timeMs' | 'angle' | 'angle2d' | 'angle3d' | 'legacyAngle' | 'side' | 'held' | 'confidence'>

/** What the tracker read over the last second, and whether it was a clean hold. */
export interface HoldReading {
  frames: number
  /** Median of the filtered angle: the number the app shows, steadied. */
  angle: number | null
  /** Medians of the unfiltered 2D image, 3D world and old-math angles, same frames. */
  angle2d: number | null
  angle3d: number | null
  legacy: number | null
  /** Max − min of the filtered angle over the second. */
  range: number | null
  /** Lowest visibility of the three points over the second. */
  confidence: number | null
  side: Side | null
  /** Why this isn't a clean hold; empty = held still and fully seen. */
  issues: string[]
  /** Nothing measured at all: can't be captured, not even anyway. */
  empty: boolean
}

/** The last second of tracker frames, fed from the page's frame loop. */
export class HoldWindow {
  private samples: Sample[] = []

  push(f: Sample) {
    const { timeMs, angle, angle2d, angle3d, legacyAngle, side, held, confidence } = f
    this.samples.push({ timeMs, angle, angle2d, angle3d, legacyAngle, side, held, confidence })
    while (this.samples.length && timeMs - this.samples[0].timeMs > HOLD_MS) this.samples.shift()
  }

  clear() {
    this.samples = []
  }

  read(now: number): HoldReading {
    return readHold(this.samples.filter((s) => now - s.timeMs <= HOLD_MS), now)
  }
}

export function readHold(win: Sample[], now: number): HoldReading {
  // Held frames repeat the last good angle through a dropout: they'd pull the median toward a stale value.
  const measured = win.filter((s) => s.angle != null && !s.held)
  const none = { frames: win.length, angle: null, angle2d: null, angle3d: null, legacy: null, range: null, confidence: null, side: null }
  if (!win.length) return { ...none, issues: ['No frames in the last second'], empty: true }
  if (!measured.length) return { ...none, issues: ['The limb isn’t being measured'], empty: true }

  const angles = measured.map((s) => s.angle!)
  const range = Math.max(...angles) - Math.min(...angles)
  const confidence = Math.min(...measured.map((s) => s.confidence))
  const sides = [...new Set(measured.map((s) => s.side))]
  const lost = win.filter((s) => s.angle == null).length
  const held = win.filter((s) => s.held).length
  const span = win[win.length - 1].timeMs - win[0].timeMs
  const stale = now - win[win.length - 1].timeMs

  const issues: string[] = []
  if (stale > STALE_MS) issues.push(`No new frames for ${(stale / 1000).toFixed(1)} s`)
  else if (span < MIN_SPAN_MS) issues.push(`Only ${(span / 1000).toFixed(1)} s of frames so far`)
  if (range > STEADY_DEG) issues.push(`Moved ${range.toFixed(1)}° (over ${STEADY_DEG}°)`)
  if (lost) issues.push(`Limb lost for ${lost} ${lost === 1 ? 'frame' : 'frames'}`)
  if (held) issues.push(`Dropped out for ${held} ${held === 1 ? 'frame' : 'frames'}`)
  if (sides.length > 1) issues.push('Switched side mid-hold')
  if (confidence < LOW_CONFIDENCE) issues.push(`Low visibility (${confidence.toFixed(2)})`)

  return {
    frames: win.length,
    angle: median(angles),
    angle2d: median(measured.flatMap((s) => (s.angle2d == null ? [] : [s.angle2d]))),
    angle3d: median(measured.flatMap((s) => (s.angle3d == null ? [] : [s.angle3d]))),
    legacy: median(measured.flatMap((s) => (s.legacyAngle == null ? [] : [s.legacyAngle]))),
    range,
    confidence,
    side: measured[measured.length - 1].side,
    issues,
    empty: false,
  }
}

// ---------------------------------------------------------------------------

export type Instrument = 'goniometer' | 'inclinometer' | 'protractor'

export interface Trial {
  id: string
  /** Epoch ms. */
  at: number
  joint: JointName
  side: Side | null
  instrument: Instrument
  /** The hand-measured angle, degrees. */
  reference: number
  /** The app's reading (median filtered angle over the hold). */
  measured: number
  angle2d: number | null
  angle3d: number | null
  legacy: number | null
  /** Max − min of the filtered angle over the hold. */
  range: number
  confidence: number
  frames: number
  /** The tracker settings that produced `measured`. */
  source: '2d' | '3d'
  model: string
  /** The issues it was captured despite ("Capture anyway"); empty for a clean hold. */
  flags: string[]
}

export function makeTrial(
  r: HoldReading,
  reference: number,
  meta: { joint: JointName; instrument: Instrument; source: '2d' | '3d'; model: string },
  at = Date.now(),
): Trial | null {
  if (r.empty || r.angle == null) return null
  return {
    id: `${at.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at,
    ...meta,
    side: r.side,
    reference,
    measured: r.angle,
    angle2d: r.angle2d,
    angle3d: r.angle3d,
    legacy: r.legacy,
    range: r.range ?? 0,
    confidence: r.confidence ?? 0,
    frames: r.frames,
    flags: r.issues,
  }
}

/** The angle math to score: what the app shows, and the three unfiltered readings behind it. */
export const VARIANTS = [
  { key: 'measured', label: 'Final (as shown)', short: 'final' },
  { key: 'angle2d', label: '2D image', short: '2D image' },
  { key: 'angle3d', label: '3D world', short: '3D world' },
  { key: 'legacy', label: 'Old math', short: 'old math' },
] as const
export type Variant = (typeof VARIANTS)[number]['key']

/** App minus reference, degrees: positive = the app reads more bend than the instrument. */
export function errorOf(t: Trial, v: Variant = 'measured'): number | null {
  const m = t[v]
  return m == null ? null : m - t.reference
}

export interface ErrorStats {
  n: number
  /** Mean absolute error. */
  mae: number
  /** Mean signed error. */
  bias: number
  /** Largest absolute error. */
  max: number
  /** Sample SD of the signed errors; null below 2 trials. */
  sd: number | null
  /** Bland–Altman 95% limits of agreement, bias ± 1.96 SD. */
  loa: [number, number] | null
}

export function errorStats(trials: Trial[], v: Variant = 'measured'): ErrorStats | null {
  const e = trials.flatMap((t) => {
    const x = errorOf(t, v)
    return x == null ? [] : [x]
  })
  if (!e.length) return null
  const n = e.length
  const bias = mean(e)
  const sd = n > 1 ? Math.sqrt(e.reduce((a, x) => a + (x - bias) ** 2, 0) / (n - 1)) : null
  return {
    n,
    mae: mean(e.map(Math.abs)),
    bias,
    max: Math.max(...e.map(Math.abs)),
    sd,
    loa: sd == null ? null : [bias - 1.96 * sd, bias + 1.96 * sd],
  }
}

/** The joints that have trials, in the order the page lists joints. */
export function jointsIn(trials: Trial[]): JointName[] {
  const order: JointName[] = ['knee', 'hip', 'elbow', 'shoulder', 'wrist']
  return order.filter((j) => trials.some((t) => t.joint === j))
}

export const jointLabel = (j: JointName) => j[0].toUpperCase() + j.slice(1)

/** Signed degrees for reading: "+1.2°", "−0.5°", and "0.0°" rather than a sign on nothing. */
export function signed(v: number, digits = 1) {
  const s = Math.abs(v).toFixed(digits)
  return `${Number(s) === 0 ? '' : v > 0 ? '+' : '−'}${s}°`
}

/** One paragraph for the slide / the team chat. */
export function summaryText(trials: Trial[]): string {
  if (!trials.length) return 'No validation trials yet.'
  const vs = (ts: Trial[]) => `vs ${listOf([...new Set(ts.map((t) => t.instrument))])}`
  const line = (name: string, s: ErrorStats, loa: boolean) =>
    `${name}, n=${s.n}: mean absolute error ${s.mae.toFixed(1)}°, bias ${signed(s.bias)}, max ${s.max.toFixed(1)}°` +
    (loa && s.loa ? `, 95% limits of agreement ${signed(s.loa[0])} to ${signed(s.loa[1])}` : '')

  const joints = jointsIn(trials)
  // Each sentence stands on its own, so any one of them can go on a slide.
  const parts = joints.map((j) => {
    const ts = trials.filter((t) => t.joint === j)
    return `${line(jointLabel(j), errorStats(ts)!, joints.length === 1)} ${vs(ts)}.`
  })
  if (joints.length > 1) parts.push(`${line('All joints', errorStats(trials)!, true)} ${vs(trials)}.`)

  const variants = VARIANTS.slice(1).flatMap((v) => {
    const s = errorStats(trials, v.key)
    return s ? [`${v.short} ${s.mae.toFixed(1)}° (n=${s.n})`] : []
  })
  if (variants.length) parts.push(`Mean absolute error of the unfiltered angle math on the same holds: ${variants.join(', ')}.`)

  const sources = [...new Set(trials.map((t) => t.source.toUpperCase()))].join('/')
  const models = [...new Set(trials.map((t) => t.model))].join('/')
  const flagged = trials.filter((t) => t.flags.length).length
  parts.push(
    `Each reading is the median of the app's filtered ${sources} angle over ${HOLD_MS / 1000} s held still (MediaPipe Pose ${models} model)` +
      (flagged ? `; ${flagged} of ${trials.length} trials ${flagged === 1 ? 'was' : 'were'} captured despite a warning.` : '.'),
  )
  return parts.join(' ')
}

const CSV_COLUMNS = [
  'time',
  'joint',
  'side',
  'instrument',
  'reference_deg',
  'measured_deg',
  'error_deg',
  'angle2d_deg',
  'error2d_deg',
  'angle3d_deg',
  'error3d_deg',
  'legacy_deg',
  'error_legacy_deg',
  'moved_deg',
  'min_confidence',
  'frames',
  'angle_source',
  'model',
  'flags',
]

export function toCsv(trials: Trial[]): string {
  const num = (v: number | null, digits = 1) => (v == null ? '' : v.toFixed(digits))
  const rows = trials.map((t) => [
    new Date(t.at).toISOString(),
    t.joint,
    t.side ?? '',
    t.instrument,
    num(t.reference),
    num(t.measured),
    num(errorOf(t)),
    num(t.angle2d),
    num(errorOf(t, 'angle2d')),
    num(t.angle3d),
    num(errorOf(t, 'angle3d')),
    num(t.legacy),
    num(errorOf(t, 'legacy')),
    num(t.range),
    num(t.confidence, 2),
    String(t.frames),
    t.source,
    t.model,
    t.flags.join('; '),
  ])
  return [CSV_COLUMNS, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
}

function csvCell(s: string) {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function listOf(words: string[]) {
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

function mean(values: number[]) {
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ---------------------------------------------------------------------------
// Trials persist across reloads, apart from the page's settings (rb.poseDebug.v1).

const TRIALS_KEY = 'rb.poseDebug.trials.v1'

export function loadTrials(): Trial[] {
  try {
    const t = JSON.parse(localStorage.getItem(TRIALS_KEY) ?? '[]') as unknown
    if (Array.isArray(t)) return t as Trial[]
  } catch {
    /* private mode or bad JSON: start empty */
  }
  return []
}

export function saveTrials(trials: Trial[]) {
  try {
    localStorage.setItem(TRIALS_KEY, JSON.stringify(trials))
  } catch {
    /* not persisted: the CSV export still works */
  }
}

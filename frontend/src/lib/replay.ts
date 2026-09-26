// Reading a recorded session back: the angle trace timed from the start, the
// reps in it, and the few things about them a therapist would want pointed
// out. Reps are found with the same thresholds the live counter uses, so the
// replay counts what the patient saw counted.

import type { AngleSampleRow, SessionStats } from '../types/session'
import { BENT, STRAIGHT } from './simulatedPose'

export interface TracePoint {
  /** Milliseconds since the session started. */
  t: number
  angle: number
}

export interface Pause {
  t: number
  ms: number
  angle: number
}

export interface Rep {
  /** 1-based. */
  n: number
  start: number
  end: number
  peakT: number
  peak: number
  /** The longest stall on the way up, if the patient held still well short of the peak. */
  pause: Pause | null
}

export interface Finding {
  tone: 'good' | 'neutral' | 'warn'
  text: string
}

/** A longer gap than this is the tracker losing the patient, not a slow sample. */
export const GAP_MS = 1000
/** Held within PAUSE_WOBBLE° for PAUSE_MS, at least PAUSE_BELOW° short of the rep's peak. */
const PAUSE_MS = 500
const PAUSE_WOBBLE = 2
const PAUSE_BELOW = 8
/** The live screen calls the target reached within 2°. */
export const REACHED_WITHIN = 2
/** Within this many degrees of the session's deepest bend is end range. */
export const END_RANGE_WITHIN = 5
/** Fade compares the first and last this-many reps, and is worth pointing out from FADE_FLAG°. */
const FADE_REPS = 3
export const FADE_FLAG = 5

export function toTrace(rows: AngleSampleRow[], startedAt: string): TracePoint[] {
  const t0 = Date.parse(startedAt)
  return rows
    .map((r) => ({ t: Math.max(0, Date.parse(r.time) - t0), angle: Number(r.angle) }))
    .sort((a, b) => a.t - b.t)
}

/** The reading at `t`, eased between samples; null where the tracker had lost the patient. */
export function angleAt(trace: TracePoint[], t: number): number | null {
  if (!trace.length || t < trace[0].t) return null
  let lo = 0
  let hi = trace.length - 1
  if (t >= trace[hi].t) return trace[hi].angle
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (trace[mid].t <= t) lo = mid
    else hi = mid
  }
  const a = trace[lo]
  const b = trace[hi]
  if (b.t - a.t > GAP_MS) return null
  return a.angle + ((b.angle - a.angle) * (t - a.t)) / (b.t - a.t)
}

/**
 * Hysteresis like the live counter: a rep starts once the reading passes
 * halfway from rest to the target and ends when it drops back near rest.
 * Rest is the session's own low reading, since a real camera rarely reads a
 * straight limb as exactly 0°. A rep still bent when the session ended
 * doesn't count, as it didn't live.
 */
export function findReps(trace: TracePoint[], target: number): Rep[] {
  if (trace.length < 3) return []
  const sorted = trace.map((p) => p.angle).sort((a, b) => a - b)
  const rest = sorted[Math.floor(sorted.length * 0.1)]
  const top = Math.max(rest + 15, Math.min(target, sorted[sorted.length - 1]))
  const bent = rest + (top - rest) * BENT
  const straight = rest + (top - rest) * STRAIGHT

  const reps: Rep[] = []
  let low = 0 // last sample back near rest: where the next rep starts
  let rep: { start: number; peak: number } | null = null
  trace.forEach((p, i) => {
    if (!rep) {
      if (p.angle < straight) low = i
      else if (p.angle > bent) rep = { start: low, peak: i }
      return
    }
    if (p.angle > trace[rep.peak].angle) rep.peak = i
    if (p.angle < straight) {
      const peak = trace[rep.peak]
      reps.push({
        n: reps.length + 1,
        start: trace[rep.start].t,
        end: p.t,
        peakT: peak.t,
        peak: Math.round(peak.angle),
        pause: findPause(trace, rep.start, rep.peak, straight),
      })
      rep = null
      low = i
    }
  })
  return reps
}

function findPause(trace: TracePoint[], from: number, to: number, straight: number): Pause | null {
  const ceiling = trace[to].angle - PAUSE_BELOW
  let best: Pause | null = null
  let anchor = from
  for (let i = from + 1; i <= to; i++) {
    if (Math.abs(trace[i].angle - trace[anchor].angle) > PAUSE_WOBBLE || trace[i].t - trace[i - 1].t > GAP_MS) anchor = i
    const a = trace[anchor]
    const ms = trace[i].t - a.t
    if (ms >= PAUSE_MS && a.angle > straight && a.angle < ceiling && (!best || ms > best.ms)) best = { t: a.t, ms, angle: Math.round(a.angle) }
  }
  return best
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** [3, 6, 7, 8] → "reps 3, 6–8". */
function repList(ns: number[]) {
  const runs: string[] = []
  for (let i = 0; i < ns.length; i++) {
    let j = i
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++
    runs.push(j > i + 1 ? `${ns[i]}–${ns[j]}` : j === i + 1 ? `${ns[i]}, ${ns[j]}` : `${ns[i]}`)
    i = j
  }
  return `${ns.length === 1 ? 'rep' : 'reps'} ${runs.join(', ')}`
}

const fadeOf = (peaks: number[]) =>
  peaks.length >= 2 * FADE_REPS ? Math.round(mean(peaks.slice(0, FADE_REPS)) - mean(peaks.slice(-FADE_REPS))) : null

/**
 * The per-session numbers the backend works out in SQL (SESSION_STATS in
 * backend/api/data/queries.py), for mock mode: each rep's peak, how far the
 * last reps fell short of the first, and the time spent at end range. A gap
 * in tracking counts as no time and ends a hold, as in the SQL.
 */
export function sessionStats(trace: TracePoint[], target: number): SessionStats {
  const peaks = findReps(trace, target).map((r) => r.peak)
  const deepest = trace.reduce((max, p) => Math.max(max, p.angle), -Infinity)
  let total = 0
  let hold = 0
  let longest = 0
  trace.forEach((p, i) => {
    const near = p.angle >= deepest - END_RANGE_WITHIN
    if (!near || (i > 0 && p.t - trace[i - 1].t > GAP_MS)) hold = 0
    if (!near) return
    const next = trace[i + 1]
    const ms = next && next.t - p.t <= GAP_MS ? next.t - p.t : 0
    total += ms
    hold += ms
    longest = Math.max(longest, hold)
  })
  const seconds = (ms: number) => Math.round(ms / 100) / 10
  return { rep_peaks: peaks, fade: fadeOf(peaks), end_range_sec: seconds(total), longest_hold_sec: seconds(longest) }
}

/** What's worth a therapist's eye, most important first. `stats` adds the time at end range. */
export function findingsFor(reps: Rep[], target: number, stats?: SessionStats | null): Finding[] {
  if (!reps.length) return [{ tone: 'neutral', text: 'No complete reps in this trace.' }]
  const out: Finding[] = []
  const peaks = reps.map((r) => r.peak)

  const paused = reps.filter((r) => r.pause)
  if (paused.length) {
    const around = Math.round(mean(paused.map((r) => r.pause!.angle)))
    out.push({ tone: 'warn', text: `Stalled partway up in ${repList(paused.map((r) => r.n))}, around ${around}°.` })
  }

  const drop = fadeOf(peaks)
  if (drop != null && drop >= FADE_FLAG) {
    out.push({ tone: 'warn', text: `Last ${FADE_REPS} reps averaged ${drop}° below the first ${FADE_REPS}.` })
  }

  const reached = reps.filter((r) => r.peak >= target - REACHED_WITHIN).length
  out.push({
    tone: reached === reps.length ? 'good' : 'neutral',
    text:
      reached === reps.length
        ? `Every rep reached the ${target}° target.`
        : reached === 0
          ? `No rep reached the ${target}° target; deepest was ${Math.max(...peaks)}°.`
          : `${reached} of ${plural(reps.length, 'rep')} reached the ${target}° target.`,
  })

  if (stats) {
    out.push({
      tone: 'neutral',
      text: `${stats.end_range_sec.toFixed(1)} s within ${END_RANGE_WITHIN}° of the deepest bend, held for ${stats.longest_hold_sec.toFixed(1)} s at most.`,
    })
  }

  const tempo = mean(reps.map((r) => r.end - r.start)) / 1000
  const spread = Math.max(...peaks) - Math.min(...peaks)
  out.push({
    tone: 'neutral',
    text: `${tempo.toFixed(1)} s a rep on average; peaks within ${spread}° of each other.`,
  })
  return out
}

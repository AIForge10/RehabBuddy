import type { Assignment, PatientOverview, PlanAction, PlanSuggestion, SessionRecord, UpdateAssignmentRequest } from '../types/session'
import { exerciseFor } from './exercises'
import { FADE_FLAG, REACHED_WITHIN } from './replay'

// The part of an assignment the therapist can edit, and what changed between
// two versions of it: the therapist's editor lists the changes before saving,
// the patient's home says what's new once they land.

export type Plan = UpdateAssignmentRequest
export type PlanField = keyof Plan

export const planOf = (a: Assignment): Plan => ({
  joint: a.exercise.joint,
  target_angle: a.target_angle,
  reps: a.reps,
  times_per_week: a.times_per_week,
})

/** The fields that differ, in reading order: exercise, target, reps, sessions a week. */
export function planChanges(before: Plan, after: Plan): PlanField[] {
  const fields: PlanField[] = ['joint', 'target_angle', 'reps', 'times_per_week']
  return fields.filter((f) => before[f] !== after[f])
}

/** The plan editor's step for the target. */
export const ANGLE_STEP = 5
export const REPS = { min: 1, max: 30 }
export const WEEKLY = { min: 1, max: 7 }

/** The targets a joint's plan allows: from a step past its resting angle (below that, no movement is asked for) to the top of its gauge. */
export function targetRange(joint: string): { min: number; max: number } {
  const ex = exerciseFor(joint)
  return { min: Math.max(ex.min, ex.rest) + ANGLE_STEP, max: ex.max }
}

// The copilot's rules: the suggested next step without the AI, which is what the
// dashboard shows in mock mode or when the backend can't be reached. Mirrors
// rule_suggestion() in backend/api/services/plan_suggestion_service.py, less
// the per-minute peaks it reads from Tiger Data's continuous aggregate.

const WINDOW = 6 // the recent sessions a suggestion is worked out from
const MIN_SESSIONS = 3 // fewer on this exercise is too little to change a plan on
const PAIN_HOLD = 6 // from here on, nothing gets harder
const PAIN_EASE = 7 // the pain check's red-flag score: ease off
const PAIN_PROGRESS = 4 // the most pain a progression allows
const ADHERENCE_MIN = 0.6
const FLAG_DAYS = 7 // a red flag this recent counts even if it came from another exercise's session
const DAY_MS = 86_400_000
/** A red flag's reason when the patient wrote nothing; their own words say more than the score, this doesn't. */
const STOCK_REASON = 'Pain score at or above 7'

type Rule = [PlanAction, Partial<Plan>, string, PlanSuggestion['confidence']]

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** Degrees gained per session over `peaks`, oldest first (least squares); null under 3 sessions. */
function trend(peaks: number[]): number | null {
  const n = peaks.length
  if (n < 3) return null
  const mid = (n - 1) / 2
  const mean = peaks.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  peaks.forEach((p, i) => {
    num += (i - mid) * (p - mean)
    den += (i - mid) ** 2
  })
  return num / den
}

/** The suggested next step for a patient's plan, from the overview already on screen. */
export function suggestPlan(o: PatientOverview, now = Date.now()): PlanSuggestion {
  const a = o.assignment
  const current = planOf(a)
  const range = targetRange(a.exercise.joint)
  const name = o.patient.full_name.split(' ')[0]
  const target = Math.round(a.target_angle)
  const measure = exerciseFor(a.exercise.joint).copy.en.best.toLowerCase()
  const window = o.sessions.slice(0, WINDOW) // newest first
  const recent = [...window].reverse()
  const peaks = recent.map((s: SessionRecord) => Math.round(s.max_angle))
  const ids = new Set(window.map((s) => s.id))
  const flags = o.red_flags
    .filter((f) => ids.has(f.session_id) || now - Date.parse(f.created_at) < FLAG_DAYS * DAY_MS)
    .sort((x, y) => y.created_at.localeCompare(x.created_at))
  const pains = [...window.flatMap((s) => (s.pain_score == null ? [] : [s.pain_score])), ...flags.map((f) => f.pain_score)]
  const maxPain = pains.length ? Math.max(...pains) : null
  const pain = maxPain ?? 0
  const painSaid = maxPain != null ? `pain at most ${maxPain}/10` : 'no pain reported'
  const done = Math.round(o.adherence_7d * a.times_per_week)
  const plan = a.times_per_week

  const rule = (): Rule => {
    // Safety first, even on thin data: after a red flag the plan only gets easier.
    if (flags.length || pain >= PAIN_EASE) {
      const f = flags[0]
      const why = f
        ? `${name} reported pain ${f.pain_score}/10 on ${day(f.created_at)}${f.reason && f.reason !== STOCK_REASON ? ` (${f.reason})` : ''}`
        : `${name} reported pain of ${pain}/10 recently`
      const eased = Math.max(range.min, target - ANGLE_STEP)
      if (eased < target) {
        return ['regress', { target_angle: eased }, `${why}. Ease the target from ${target}° to ${eased}° and check in before the next session.`, 'high']
      }
      return ['hold', {}, `${why}. Keep the plan and check in before the next session.`, 'high']
    }
    if (o.sessions.length < MIN_SESSIONS) {
      return ['hold', {}, `Not enough data yet: ${name} has ${plural(o.sessions.length, 'session')} on this exercise. Keep the plan and suggest again after ${MIN_SESSIONS}.`, 'low']
    }
    if (pain >= PAIN_HOLD) {
      return ['hold', {}, `${name}'s pain reached ${pain}/10 in a recent session. Keep the plan until it's back to ${PAIN_PROGRESS}/10 or below.`, 'medium']
    }
    if (done < ADHERENCE_MIN * plan) {
      return ['hold', {}, `${name} did ${done} of ${plan} planned sessions in the past 7 days. Keep the plan until the routine is steady, then review.`, 'medium']
    }

    const last3 = recent.slice(-3)
    const latest = peaks[peaks.length - 1]
    const reached = last3.filter((s) => Math.round(s.max_angle) >= target - REACHED_WITHIN)
    if (reached.length >= 2) {
      const fades = last3.flatMap((s) => (s.stats?.fade != null && s.stats.fade >= FADE_FLAG ? [s.stats.fade] : []))
      if (fades.length >= 2) {
        return ['hold', {}, `${name} reaches the ${target}° target, but the last 3 reps fell up to ${Math.max(...fades)}° short of the first 3 in ${fades.length} of the last 3 sessions. Keep the plan until the reps stay even.`, 'medium']
      }
      if (pain > PAIN_PROGRESS) {
        return ['hold', {}, `${name} reaches the ${target}° target, but pain reached ${pain}/10 recently. Keep the plan until it's back to ${PAIN_PROGRESS}/10 or below.`, 'medium']
      }
      const raised = Math.min(range.max, target + ANGLE_STEP)
      if (raised === target) return ['hold', {}, `${name} reaches the ${target}° target, the top of this exercise's range. Keep the plan.`, 'medium']
      return [
        'progress',
        { target_angle: raised },
        `${name} reached the ${target}° target in ${reached.length} of the last 3 sessions (${peaks.slice(-3).map((p) => `${p}°`).join(', ')}), with ${painSaid} and ${done} of ${plan} sessions in the past 7 days. Raise the target to ${raised}°.`,
        'high',
      ]
    }

    const gap = target - latest
    const last4 = peaks.slice(-4)
    if (last4.length === 4 && Math.max(...last4) - Math.min(...last4) <= 3 && gap > REACHED_WITHIN && pain <= PAIN_PROGRESS && a.reps < REPS.max) {
      const more = Math.min(REPS.max, a.reps + 2)
      return [
        'progress',
        { reps: more },
        `${name}'s ${measure} has stayed between ${Math.min(...last4)}° and ${Math.max(...last4)}° over the last 4 sessions, ${gap}° short of the ${target}° target, with ${painSaid}. Add ${more - a.reps} reps a session for more time near end range.`,
        'medium',
      ]
    }
    if (gap <= REACHED_WITHIN) {
      return ['hold', {}, `${name} reached the ${target}° target last session (${latest}°), but not in the 2 before it. Keep the plan one more session to confirm, then raise it.`, 'medium']
    }
    const t = trend(peaks)
    if (t != null && t >= 0.5) {
      const k = Math.ceil(gap / t)
      return [
        'hold',
        {},
        `${name}'s ${measure} rose from ${peaks[0]}° to ${latest}° over the last ${recent.length} sessions (about +${t.toFixed(1)}° a session), with ${painSaid}. At this rate the ${target}° target is about ${plural(k, 'session')} away; keep the plan until it's reached.`,
        'medium',
      ]
    }
    return ['hold', {}, `${name}'s ${measure} was ${latest}° last session, ${gap}° short of the ${target}° target, with no clear gain over the last ${recent.length} sessions. Keep the plan and review after the next few.`, 'low']
  }

  const [action, changes, rationale, confidence] = rule()

  // What the therapist can check the suggestion against at a glance.
  const evidence: string[] = []
  if (peaks.length) evidence.push(peaks.length > 1 ? `Peak ${peaks[0]}° → ${peaks[peaks.length - 1]}° over ${peaks.length} sessions` : `Peak ${peaks[0]}°`)
  const traced = recent.slice(-3).filter((s) => s.stats?.rep_peaks.length)
  if (traced.length) {
    const reps = traced.flatMap((s) => s.stats!.rep_peaks)
    const last = traced.length === 1 ? 'last session' : `last ${traced.length} sessions`
    evidence.push(`${reps.filter((r) => r >= a.target_angle - REACHED_WITHIN).length} of ${reps.length} reps reached ${target}°, ${last}`)
  }
  evidence.push(`${done} of ${plan} sessions, past 7 days`)
  if (flags.length) evidence.push(flags.length === 1 ? 'Red flag' : `${flags.length} red flags`)
  else if (maxPain != null) evidence.push(`Pain ≤ ${maxPain}/10`)

  return { action, current, proposed: { ...current, ...changes }, rationale, confidence, evidence, guardrails: [], is_fallback: true }
}

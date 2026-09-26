import type { Assignment, UpdateAssignmentRequest } from '../types/session'

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

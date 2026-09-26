import { exerciseFor } from '../../lib/exercises'
import { useLanguage } from '../../lib/language'
import type { PlanField } from '../../lib/plan'
import type { Assignment } from '../../types/session'

/** The therapist changed the plan while this screen was open: say so above the card it changed, with the new values. */
export function PlanNotice({ changed, assignment, onDismiss }: { changed: PlanField[]; assignment: Assignment; onDismiss: () => void }) {
  const { s, lang } = useLanguage()
  const ex = exerciseFor(assignment.exercise.joint)
  const copy = ex.copy[lang]
  const has = (f: PlanField) => changed.includes(f)
  // A new exercise comes with its own target, so both are news.
  const details = [
    has('joint') && (ex.part === assignment.exercise.joint ? copy.name : assignment.exercise.name),
    (has('joint') || has('target_angle')) && copy.toTarget(assignment.target_angle),
    has('reps') && s.chipReps(assignment.reps),
    has('times_per_week') && s.timesPerWeek(assignment.times_per_week),
  ].filter((d): d is string => Boolean(d))

  return (
    <div role="status" className="flex animate-rise items-start gap-3 rounded-2xl bg-brand-soft px-5 py-4 ring-1 ring-brand/25">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="mt-px shrink-0">
        <circle cx="10" cy="10" r="9" className="fill-brand" />
        <path d="m6 10.2 2.6 2.5L14 7.5" fill="none" className="stroke-on-brand" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="min-w-0 flex-1 text-[15px] leading-snug">
        <span className="font-bold text-ink">{s.planUpdated}</span>
        {details.length > 0 && <span className="text-ink-2"> · {details.join(' · ')}</span>}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={s.dismiss}
        className="-my-1.5 -mr-2 grid size-8 shrink-0 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-brand/10 hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

import { ExerciseFigure } from '../../components/ExerciseFigure'
import { JointPicker } from '../../components/JointPicker'
import { Button, PatientScreen } from '../../components/Screen'
import type { BodyPart, Exercise } from '../../lib/exercises'
import { useLanguage } from '../../lib/language'
import { DEMO_PHASES, useDemoLoop } from '../../lib/useDemoLoop'
import { useHighlight } from '../../lib/useHighlight'
import type { Assignment } from '../../types/session'
import { StepHeader } from './StepHeader'

// One rep on a loop beside its four steps, in the same card as camera setup so
// the two screens read as one flow. The highlight slides to the step that's
// playing and the rail between steps fills as the rep moves through it; each
// new rep, or a new joint from the picker above, winds the list back to step 1
// rather than snapping it there. Picking a joint swaps the exercise: same
// figure, the camera gliding in on the new joint.

/** How long the start hold spends winding the rails back up, before step 1's rail fills. */
const REWIND_MS = 450
const START_MS = DEMO_PHASES[0].ms

export function Brief({
  assignment,
  exercise,
  onPick,
  onNext,
}: {
  assignment: Assignment
  exercise: Exercise
  onPick: (part: BodyPart) => void
  onNext: () => void
}) {
  const { s, lang } = useLanguage()
  const copy = exercise.copy[lang]
  const target = assignment.target_angle
  const demo = useDemoLoop(exercise.rest, target)
  const last = copy.steps.length - 1
  const { highlight, items } = useHighlight<HTMLLIElement>(demo.phase)
  // Every rep, and every switch, opens on the start hold: its first moments drain the rails.
  const since = demo.phase === 0 ? demo.progress * START_MS : Infinity
  const rewinding = since < REWIND_MS
  const fill = (i: number) => {
    if (i !== demo.phase) return i < demo.phase ? 1 : 0
    // Step 1's rail waits out the rewind, then fills over the rest of the hold.
    return i ? demo.progress : Math.max(0, (since - REWIND_MS) / (START_MS - REWIND_MS))
  }

  return (
    <PatientScreen wide>
      <StepHeader step={1} title={copy.name} sub={copy.briefSub(assignment.reps, target)} />

      <div className="mt-7">
        <JointPicker value={exercise.part} onChange={onPick} />
      </div>

      <section className="mt-4 grid overflow-hidden rounded-3xl bg-surface ring-1 ring-line lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="aspect-[4/3] bg-stage sm:aspect-[16/10] lg:aspect-auto lg:min-h-[460px]">
          <ExerciseFigure exercise={exercise} angle={demo.angle} target={target} tracking={false} />
        </div>

        <div className="flex flex-col p-4 sm:p-5">
          <h2 className="label-mono px-1.5 pt-1 text-muted">{s.briefTitle}</h2>
          <div className="relative mt-3">
            <span
              ref={highlight}
              aria-hidden="true"
              className="absolute left-0 top-0 rounded-2xl bg-brand-soft transition-[transform,width,height] duration-[450ms] ease-in-out motion-reduce:transition-none"
            />
            <ol>
              {copy.steps.map((step, i) => {
                const active = i === demo.phase
                return (
                  // Keyed by place, not title: a new joint rewrites the steps in the same rows, so the rails can drain.
                  <li
                    key={i}
                    ref={(el) => {
                      items.current[i] = el
                    }}
                    aria-current={active ? 'step' : undefined}
                    className="relative"
                  >
                    <div className="flex items-start gap-3.5 px-3 py-3">
                      <span
                        className={`grid size-10 shrink-0 place-items-center rounded-full font-bold tabular-nums transition-colors duration-300 ${
                          active ? 'bg-brand text-on-brand' : 'bg-raised text-ink-2 ring-1 ring-line ring-inset'
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 pt-0.5">
                        <span className={`block font-bold transition-colors duration-300 ${active ? 'text-brand-ink' : ''}`}>{step.title}</span>
                        <span className="block text-sm leading-snug text-ink-2">{step.body}</span>
                      </span>
                    </div>
                    {i < last && (
                      <span aria-hidden="true" className="pointer-events-none absolute -bottom-2 left-[31px] top-[56px] w-0.5 overflow-hidden rounded-full bg-line-strong">
                        <span
                          className={`block w-full rounded-full bg-brand ${rewinding ? 'transition-[height] duration-[400ms] ease-in-out motion-reduce:transition-none' : ''}`}
                          style={{ height: `${fill(i) * 100}%` }}
                        />
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          </div>

          <div className="mt-auto pt-4">
            <p className="flex items-start gap-2.5 px-1.5 text-sm leading-snug text-ink-2">
              <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0 text-warn">
                <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M10 5.8v5.2M10 13.8v.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
              {copy.safety}
            </p>
            <Button onClick={onNext} className="mt-4 w-full">
              {s.briefCta}
            </Button>
          </div>
        </div>
      </section>
    </PatientScreen>
  )
}

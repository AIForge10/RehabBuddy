import { LegFigure } from '../../components/LegFigure'
import { Button, PatientScreen } from '../../components/Screen'
import { useLanguage } from '../../lib/language'
import { useDemoLoop } from '../../lib/useDemoLoop'
import type { Assignment } from '../../types/session'
import { StepHeader } from './StepHeader'

// One rep on a loop beside its four steps, in the same card as camera setup so
// the two screens read as one flow. The step that's playing lights up and the
// rail between steps fills as the rep moves through it.

export function Brief({ assignment, onNext }: { assignment: Assignment; onNext: () => void }) {
  const { s } = useLanguage()
  const target = assignment.target_angle
  const demo = useDemoLoop(target)
  const last = s.demoSteps.length - 1

  return (
    <PatientScreen wide>
      <StepHeader step={1} title={assignment.exercise.name} sub={s.briefSub(assignment.reps, target)} />

      <section className="mt-6 grid overflow-hidden rounded-[28px] bg-surface shadow-lift ring-1 ring-line lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="aspect-[4/3] bg-stage sm:aspect-[16/10]">
          <LegFigure angle={demo.angle} target={target} tracking={false} />
        </div>

        <div className="flex flex-col p-4 sm:p-5">
          <h2 className="px-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted">{s.briefTitle}</h2>
          <ol className="mt-3">
            {s.demoSteps.map((step, i) => {
              const active = i === demo.phase
              const fill = i < demo.phase ? 1 : active ? demo.progress : 0
              return (
                <li key={step.title} aria-current={active ? 'step' : undefined} className="relative">
                  <div className={`flex items-start gap-3.5 rounded-[20px] px-3 py-3 transition-colors duration-300 ${active ? 'bg-brand-soft' : ''}`}>
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
                      <span className="block w-full rounded-full bg-brand" style={{ height: `${fill * 100}%` }} />
                    </span>
                  )}
                </li>
              )
            })}
          </ol>

          <div className="mt-auto pt-4">
            <p className="flex items-start gap-2.5 px-1.5 text-sm leading-snug text-ink-2">
              <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0 text-warn">
                <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M10 5.8v5.2M10 13.8v.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
              {s.briefSafety}
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

import { TITLE } from '../../components/Screen'
import { useLanguage } from '../../lib/language'

export function StepHeader({ step, total = 2, title, sub }: { step: number; total?: number; title: string; sub: string }) {
  const { s } = useLanguage()
  return (
    <div className="pt-6 sm:pt-10">
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`h-1 w-10 rounded-full transition-colors ${i < step ? 'bg-brand' : 'bg-line-strong'}`} />
          ))}
        </div>
        <p className="label-mono text-muted">{s.stepOf(step, total)}</p>
      </div>
      <h1 className={`mt-4 ${TITLE}`}>{title}</h1>
      <p className="mt-3 text-lg leading-relaxed text-ink-2">{sub}</p>
    </div>
  )
}

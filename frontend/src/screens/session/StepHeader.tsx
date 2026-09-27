import { TITLE } from '../../components/Screen'
import { useLanguage } from '../../lib/language'

export function StepHeader({
  step,
  total = 2,
  title,
  sub,
  onBack,
}: {
  step: number
  total?: number
  title: string
  sub: string
  onBack?: () => void
}) {
  const { s } = useLanguage()
  return (
    <div className="pt-6 sm:pt-10">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="-ml-2.5 mb-3 inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-muted transition-colors hover:bg-surface hover:text-ink cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M13 8H4m3.5-3.5L4 8l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {s.back}
        </button>
      )}
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

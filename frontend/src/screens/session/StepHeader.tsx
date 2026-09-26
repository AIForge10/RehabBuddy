import { useLanguage } from '../../lib/language'

export function StepHeader({ step, total = 2, title, sub }: { step: number; total?: number; title: string; sub: string }) {
  const { s } = useLanguage()
  return (
    <div className="mt-6">
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`h-1.5 w-10 rounded-full transition-colors ${i < step ? 'bg-brand' : 'bg-line-strong'}`} />
          ))}
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{s.stepOf(step, total)}</p>
      </div>
      <h1 className="mt-3 font-display text-[36px] font-medium leading-[1.1] tracking-tight">{title}</h1>
      <p className="mt-2 text-lg text-ink-2">{sub}</p>
    </div>
  )
}

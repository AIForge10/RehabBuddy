import { AngleGauge } from '../../components/AngleGauge'
import { Sparkline } from '../../components/Sparkline'
import { EXERCISES } from '../../lib/exercises'
import { useLanguage } from '../../lib/language'

// Small, static illustrations for the four "how it works" steps. Decorative:
// each step's title and body carry the meaning.

export function PlanVisual() {
  const { s, lang } = useLanguage()
  const copy = EXERCISES.knee.copy[lang]
  return (
    <div className="w-[84%] max-w-[230px] rounded-2xl bg-surface p-3.5 shadow-card ring-1 ring-line">
      <p className="label-mono text-[10px] text-brand-ink">{s.today}</p>
      <p className="mt-1 font-display text-lg leading-tight">{copy.name}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] font-semibold text-ink-2">
        <span className="rounded-full bg-raised px-2 py-1 ring-1 ring-line">{s.chipReps(10)}</span>
        <span className="rounded-full bg-raised px-2 py-1 ring-1 ring-line">{copy.toTarget(90)}</span>
      </div>
      <div className="mt-3 flex gap-1">
        {[1, 1, 0].map((on, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${on ? 'bg-brand' : 'bg-brand-track'}`} />
        ))}
      </div>
    </div>
  )
}

export function MeasureVisual() {
  return (
    <div className="w-[70%] max-w-[190px] pt-3">
      <AngleGauge angle={76} target={90}>
        <p className="text-[26px] font-bold leading-none tabular-nums">76°</p>
      </AngleGauge>
    </div>
  )
}

/** Both languages at once: this is the one place the other language shows on purpose. */
export function CoachVisual() {
  const lines = [
    { tag: 'EN', text: EXERCISES.knee.copy.en.steps[1].title },
    { tag: 'ES', text: EXERCISES.knee.copy.es.steps[1].title },
  ]
  return (
    <div className="flex w-[84%] max-w-[230px] flex-col gap-2">
      {lines.map((l, i) => (
        <p
          key={l.tag}
          className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold shadow-card ring-1 ${
            i ? 'self-end rounded-br-md bg-hero text-on-hero ring-white/10' : 'rounded-bl-md bg-surface ring-line'
          }`}
        >
          <span className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold ${i ? 'bg-brand text-on-brand' : 'bg-brand-soft text-brand-ink'}`}>{l.tag}</span>“{l.text}”
        </p>
      ))}
    </div>
  )
}

export function ReportVisual() {
  const { s } = useLanguage()
  return (
    <div className="w-[84%] max-w-[230px] rounded-2xl bg-surface p-3.5 shadow-card ring-1 ring-line">
      <div className="flex items-center gap-2">
        <span className="relative grid size-7 place-items-center rounded-full bg-brand-soft text-[11px] font-bold text-brand-ink">
          ML
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-critical ring-2 ring-surface" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-bold">Maria</span>
      </div>
      <span className="mt-2.5 inline-flex rounded-full bg-critical-soft px-2 py-0.5 text-[11px] font-bold text-critical">{s.pain} 7/10</span>
      <Sparkline values={[72, 75, 74, 78, 81, 84, 88]} target={90} className="mt-2 w-full" />
    </div>
  )
}

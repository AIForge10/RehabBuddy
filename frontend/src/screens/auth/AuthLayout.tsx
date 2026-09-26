import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AngleGauge } from '../../components/AngleGauge'
import { LanguageToggle } from '../../components/LanguageToggle'
import { LimbLattice } from '../../components/LimbLattice'
import { Logo } from '../../components/Logo'
import { StatusBarScrim } from '../../components/Screen'
import { useJointTour, toward } from '../../lib/useJointTour'
import { useLanguage } from '../../lib/language'
import { useReducedMotion } from '../../lib/useReducedMotion'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Form on the left, the brand card on the right (desktop only). */
export function AuthLayout({ title, sub, children, footer }: { title: string; sub: string; children: ReactNode; footer: ReactNode }) {
  const { s } = useLanguage()
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <StatusBarScrim />
      <div className="flex flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
        <header className="flex items-center justify-between gap-3">
          <Logo to="/welcome" />
          <LanguageToggle />
        </header>

        <main className="mx-auto flex w-full max-w-[420px] flex-1 animate-rise flex-col justify-center py-10">
          <Link
            to="/welcome"
            className="-ml-2.5 mb-6 inline-flex h-10 w-fit items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M13 8H4m3.5-3.5L4 8l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {s.back}
          </Link>
          <h1 className="font-display text-[34px] leading-[1.06] sm:text-[42px]">{title}</h1>
          <p className="mt-2.5 text-[17px] leading-relaxed text-ink-2">{sub}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-8 text-center text-[15px] text-ink-2">{footer}</p>
        </main>

        <p className="label-mono text-center text-[10px] text-muted">{s.localNote}</p>
      </div>
      <BrandPanel />
    </div>
  )
}

/** The product in miniature: a live gauge touring the joints over the limb lattice, and the pitch. */
function BrandPanel() {
  const { s, lang } = useLanguage()
  const reduced = useReducedMotion()
  const { part, exercise: ex, demo } = useJointTour(!reduced)
  const angle = reduced ? toward(ex, 0.87) : demo.angle
  const copy = ex.copy[lang]
  const cue = copy.steps[reduced ? 2 : demo.phase].title

  return (
    <aside className="hidden p-3 lg:block" aria-hidden="true">
      <div className="relative isolate flex h-full min-h-[640px] flex-col overflow-hidden rounded-3xl bg-hero-2 p-10 text-on-hero ring-1 ring-white/8 xl:p-12">
        <LimbLattice mask="[mask-image:radial-gradient(ellipse_80%_70%_at_100%_0%,black_25%,transparent_75%)]" />
        <p className="label-mono flex items-center gap-2.5 text-brand-light">
          <span className="h-px w-6 bg-current" />
          {s.heroEyebrow}
        </p>

        <div className="my-auto w-full max-w-[360px] self-center rounded-3xl bg-stage p-6 ring-1 ring-white/10">
          <AngleGauge key={part} angle={angle} target={ex.target} min={ex.min} max={ex.max} name={copy.angleLabel} onDark>
            <p className="label-mono text-white/55">{copy.angleLabel}</p>
            <p className="text-[44px] font-bold leading-none tabular-nums text-white">{Math.round(angle)}°</p>
          </AngleGauge>
          <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4">
            <span className="label-mono rounded-md bg-brand px-1.5 py-1 text-[10px] text-on-brand">{s.coach}</span>
            <span key={cue} className="animate-rise truncate text-[15px] font-semibold">
              “{cue}”
            </span>
          </div>
        </div>

        <blockquote className="max-w-lg font-display text-[26px] leading-[1.22] xl:text-[30px]">{s.panelQuote}</blockquote>
        <dl className="mt-8 grid grid-cols-3 border-t border-white/12 pt-6">
          {s.panelStats.map((st) => (
            <div key={st.label} className="flex flex-col-reverse">
              <dt className="label-mono mt-2 text-on-hero-2">{st.label}</dt>
              <dd className="font-display text-[30px] leading-none">{st.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  )
}

/** Labelled input with inline error or hint. `trailing` sits inside the right edge. */
export function Field({
  label,
  error,
  hint,
  trailing,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; trailing?: ReactNode }) {
  const id = useId()
  const note = error ?? hint
  return (
    <div>
      <label htmlFor={id} className="text-[15px] font-semibold">
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? `${id}-note` : undefined}
          className={`h-14 w-full rounded-xl bg-surface px-4 text-[17px] text-ink ring-1 ring-line-strong transition-shadow duration-200 placeholder:text-muted hover:ring-ink/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-critical ${trailing ? 'pr-14' : ''}`}
          {...input}
        />
        {trailing && <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>}
      </div>
      {note && (
        <p id={`${id}-note`} className={`mt-1.5 text-sm ${error ? 'font-medium text-critical' : 'text-muted'}`}>
          {note}
        </p>
      )}
    </div>
  )
}

export function PasswordField(props: Omit<Parameters<typeof Field>[0], 'type' | 'trailing'>) {
  const { s } = useLanguage()
  const [shown, setShown] = useState(false)
  return (
    <Field
      {...props}
      type={shown ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? s.hidePassword : s.showPassword}
          aria-pressed={shown}
          className="grid size-11 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-ink"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" />
            <circle cx="10" cy="10" r="2.5" />
            {shown && <path d="M3.5 3.5l13 13" />}
          </svg>
        </button>
      }
    />
  )
}

export function Spinner() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" className="animate-spin">
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M17.5 10A7.5 7.5 0 0 0 10 2.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

/** Form-level error, announced when it appears. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2.5 rounded-xl bg-critical-soft px-4 py-3 text-[15px] font-medium text-critical ring-1 ring-critical/20">
      <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" className="mt-px shrink-0">
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path d="M8 4.5v4.2M8 11v.3" className="stroke-critical-soft" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {children}
    </p>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LanguageToggle } from '../components/LanguageToggle'
import { LimbLattice } from '../components/LimbLattice'
import { ArmMark, LegMark, Logo, Wordmark } from '../components/Logo'
import { ArrowRight, buttonClass } from '../components/Screen'
import { useAuth } from '../lib/auth'
import { useLanguage } from '../lib/language'
import type { Role } from '../types/session'
import { Spinner } from './auth/AuthLayout'
import { HeroStage } from './welcome/HeroStage'
import { CoachVisual, MeasureVisual, PlanVisual, ReportVisual } from './welcome/StepVisuals'

// The signed-out front door: what bendwith.us does, for whom, and why it
// matters, then into sign up or the one-tap demo. Copy follows the build
// plan's pitch; stats cite its sources in the footer.
//
// Layout is editorial rather than a stack of cards: sections open on a mono
// kicker and a display headline, facts sit on hairline rules, and the only
// boxed things are the product itself (the stage, the step previews) and the
// two audience panels.

const INTRO_KEY = 'rehabbuddy.intro'
const STEP_VISUALS = [PlanVisual, MeasureVisual, CoachVisual, ReportVisual]
const SOURCE_URLS = [
  'https://www.webpt.com/blog/improving-home-exercise-program-adherence-in-physical-therapy',
  'https://clinicaltrials.gov/study/NCT06016257',
]

export default function Welcome() {
  const [intro, setIntro] = useState(() => {
    try {
      if (sessionStorage.getItem(INTRO_KEY)) return false
    } catch {
      /* no storage: play it */
    }
    return !matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  // Once per tab: coming back from log in shouldn't replay it.
  useEffect(() => {
    try {
      sessionStorage.setItem(INTRO_KEY, '1')
    } catch {
      /* ignore */
    }
  }, [])

  return (
    <div className="min-h-dvh overflow-x-clip pb-[env(safe-area-inset-bottom)]">
      {intro && <Intro onDone={() => setIntro(false)} />}
      <Header />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <Audiences />
        <Finale />
      </main>
      <Footer />
    </div>
  )
}

/** One-tap demo sign-in; the signed-in account makes the route redirect. */
function useDemo() {
  const { demoSignIn } = useAuth()
  const [pending, setPending] = useState<Role | null>(null)
  const start = (role: Role) => {
    setPending(role)
    demoSignIn(role).catch(() => setPending(null))
  }
  return { pending, start }
}

/** Splash: the leg swings in, the wordmark wipes on, then the page shows through. Tap to skip. */
function Intro({ onDone }: { onDone: () => void }) {
  const { s } = useLanguage()
  return (
    <div
      aria-hidden="true"
      onClick={onDone}
      onAnimationEnd={(e) => e.target === e.currentTarget && onDone()}
      className="fixed inset-0 z-50 grid animate-splash-out place-items-center bg-canvas"
    >
      <div className="flex flex-col items-center px-6 text-center">
        <div className="flex items-center gap-4">
          <LegMark className="h-20 w-auto animate-splash-mark text-brand sm:h-24" />
          <Wordmark className="mt-4 h-10 w-auto animate-splash-word text-ink sm:h-12" />
        </div>
        <p className="label-mono mt-7 animate-splash-tag text-muted sm:text-xs">{s.heroEyebrow}</p>
      </div>
    </div>
  )
}

function Header() {
  const { s } = useLanguage()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-20 border-b pt-[env(safe-area-inset-top)] transition-colors duration-300 ${
        scrolled ? 'border-line bg-canvas/85 backdrop-blur-xl' : 'border-transparent'
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-3 px-5">
        <Logo to="/welcome" />
        <nav className="flex shrink-0 items-center gap-2 sm:gap-3">
          <LanguageToggle />
          <Link to="/login" className="hidden h-11 items-center rounded-xl px-3.5 font-semibold text-ink-2 transition-colors hover:bg-surface hover:text-ink sm:inline-flex">
            {s.navLogin}
          </Link>
          {/* Phones get the hero's own buttons right below; the header only has room for the language. */}
          <Link to="/signup" className={`${buttonClass('primary', 'md')} max-sm:!hidden`}>
            {s.navSignup}
          </Link>
        </nav>
      </div>
    </header>
  )
}

/** Section opener: a short rule and a mono caps line. */
function Kicker({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  return (
    <p className={`label-mono flex items-center gap-2.5 ${onDark ? 'text-brand-light' : 'text-brand-ink'}`}>
      {children}
    </p>
  )
}

/** List bullet: a right angle, a joint bent to 90°. */
function Angle({ className = 'text-brand-ink' }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className={`mt-[5px] shrink-0 ${className}`}>
      <path d="M2.5 1.5v10h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.6 5.4v5.2L10.8 8Z" fill="currentColor" />
    </svg>
  )
}

/** The therapist's side: a chart on axes. */
function TrendIcon({ size, className = '' }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M4 20V4m0 16h16M8 15l3.5-4 3 2.5L20 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Hero() {
  const { s } = useLanguage()
  const demo = useDemo()
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-8 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16 lg:pb-28 lg:pt-16">
      <div className="animate-rise">
        <Kicker>{s.heroEyebrow}</Kicker>
        <h1 className="mt-6 font-display text-[44px] leading-[1] sm:text-[60px] lg:text-[66px]">
          {s.heroTitle[0]} {s.heroTitle[1]}
        </h1>
        <p className="mt-6 max-w-[33rem] text-lg leading-relaxed text-ink-2 sm:text-xl">{s.heroSub}</p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link to="/signup" className={`${buttonClass('primary')} group`}>
            {s.heroCta}
            <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
          <button type="button" disabled={demo.pending != null} onClick={() => demo.start('patient')} className={buttonClass('secondary')}>
            {demo.pending === 'patient' ? <Spinner /> : <PlayIcon />}
            {s.ctaDemo}
          </button>
        </div>
        {/* The product has two sides; the therapist's gets its own way in, a step below the two buttons. */}
        <button
          type="button"
          disabled={demo.pending != null}
          onClick={() => demo.start('therapist')}
          className="group mt-5 inline-flex items-center gap-3 rounded-xl py-1 pr-2 text-left text-[15px] leading-snug disabled:opacity-60"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface text-brand-ink ring-1 ring-line transition-colors group-hover:ring-line-strong">
            {demo.pending === 'therapist' ? <Spinner /> : <TrendIcon size={18} />}
          </span>
          <span>
            <span className="text-ink-2">{s.heroTherapistAsk}</span>{' '}
            <span className="whitespace-nowrap font-bold text-brand-ink underline-offset-4 group-hover:underline">
              {s.heroTherapist}
              <ArrowRight size={15} className="ml-1 inline-block align-[-2px] transition-transform duration-200 group-hover:translate-x-0.5" />
            </span>
          </span>
        </button>
        <p className="mt-4 text-[15px] text-ink-2 sm:hidden">
          {s.haveAccount}{' '}
          <Link to="/login" className="font-bold text-brand-ink underline-offset-4 hover:underline">
            {s.navLogin}
          </Link>
        </p>
        <ul className="label-mono mt-8 flex flex-wrap items-center gap-x-3.5 gap-y-2 text-muted">
          {s.heroPoints.map((p, i) => (
            <li key={p} className="flex items-center gap-3.5">
              {i > 0 && <span aria-hidden="true" className="h-3 w-px bg-line-strong" />}
              {p}
            </li>
          ))}
        </ul>
      </div>
      <HeroStage />
    </section>
  )
}

function Problem() {
  const { s } = useLanguage()
  const visuals = [<Pictogram key="share" />, <Drop key="drop" labels={s.statBars} />, <Blank key="blank" label={s.statNoData} />]
  return (
    <section className="border-y border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20 lg:py-28">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Kicker>{s.problemEyebrow}</Kicker>
          <h2 className="mt-5 font-display text-[32px] leading-[1.08] sm:text-[42px]">{s.problemTitle}</h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-2">{s.problemBody}</p>
        </div>
        <ul className="border-t-2 border-ink">
          {s.stats.map((st, i) => (
            <li key={st.value} className="grid items-center gap-x-10 gap-y-5 border-b border-line py-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <p className="font-display text-[48px] leading-none sm:text-[56px]">{st.value}</p>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
                  {st.label}
                  <a href="#sources" className="ml-0.5 align-super font-mono text-[10px] font-semibold text-muted hover:text-ink">
                    [{st.source}]
                  </a>
                </p>
              </div>
              <div aria-hidden="true">{visuals[i]}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** 35%: seven patients in twenty, as legs and arms in a checkerboard, since rehab is every joint. */
function Pictogram() {
  return (
    <div className="grid w-fit grid-cols-5 gap-x-3 gap-y-2.5">
      {Array.from({ length: 20 }, (_, i) => {
        const tone = i < 7 ? 'text-brand' : 'text-line-strong'
        // Five across, so alternating by index staggers each row against the last.
        const leg = i % 2 === 0
        return (
          <span key={i} className="grid h-9 w-11 place-items-center">
            {leg ? <LegMark className={`h-9 w-auto ${tone}`} /> : <ArmMark className={`h-auto w-11 ${tone}`} />}
          </span>
        )
      })}
    </div>
  )
}

/** 64% → 23%: the same people, a few weeks apart. */
function Drop({ labels }: { labels: string[] }) {
  const rows = [
    { label: labels[0], pct: 64, strong: false },
    { label: labels[1], pct: 23, strong: true },
  ]
  return (
    <div className="space-y-3.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="label-mono flex justify-between text-muted">
            <span>{r.label}</span>
            <span className={r.strong ? 'text-ink' : ''}>{r.pct}%</span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-raised ring-1 ring-line ring-inset">
            <div className={`h-full origin-left animate-grow rounded-full ${r.strong ? 'bg-brand' : 'bg-muted/50'}`} style={{ width: `${r.pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** "Unseen": the chart a therapist gets today. Axes, a goal, and nothing on it. */
function Blank({ label }: { label: string }) {
  return (
    <div className="relative h-24 rounded-xl border border-dashed border-line-strong">
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <line x1="0" x2="100%" y1="32%" y2="32%" className="stroke-ink-2/40" strokeDasharray="3 5" />
      </svg>
      <span className="label-mono absolute inset-0 grid place-items-center text-muted">{label}</span>
    </div>
  )
}

function HowItWorks() {
  const { s } = useLanguage()
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
      <div className="max-w-2xl">
        <Kicker>{s.howEyebrow}</Kicker>
        <h2 className="mt-5 font-display text-[32px] leading-[1.08] sm:text-[42px]">{s.howTitle}</h2>
      </div>
      <ol className="mt-14 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
        {s.howSteps.map((step, i) => {
          const Visual = STEP_VISUALS[i]
          return (
            <li key={step.title}>
              {/* A rail segment per step, like the steps inside the app. */}
              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="grid size-7 place-items-center rounded-full bg-ink font-mono text-xs font-semibold text-canvas">{i + 1}</span>
                <span className="h-px flex-1 bg-line-strong" />
              </div>
              <div
                aria-hidden="true"
                className="mt-5 grid h-44 place-items-center overflow-hidden rounded-2xl bg-raised bg-[radial-gradient(var(--rb-line-strong)_1px,transparent_1.2px)] bg-[size:16px_16px] ring-1 ring-line"
              >
                <Visual />
              </div>
              <h3 className="mt-5 text-lg font-bold leading-snug">{step.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{step.body}</p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function Audiences() {
  const { s } = useLanguage()
  return (
    <section className="mx-auto grid max-w-6xl gap-4 px-5 pb-20 lg:grid-cols-2 lg:pb-28">
      <div className="rounded-3xl bg-surface p-7 ring-1 ring-line sm:p-10">
        <div className="flex items-end gap-3 text-brand">
          <LegMark className="h-10 w-auto" />
          <ArmMark className="h-auto w-[68px]" />
        </div>
        <h3 className="mt-6 font-display text-[30px] leading-tight">{s.forPatients}</h3>
        <ul className="mt-6">
          {s.forPatientsList.map((item) => (
            <li key={item} className="flex gap-3.5 border-t border-line py-4 text-[16px] leading-snug text-ink-2">
              <Angle />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative isolate overflow-hidden rounded-3xl bg-hero p-7 text-on-hero ring-1 ring-white/8 sm:p-10">
        <LimbLattice opacity={0.3} />
        <TrendIcon size={40} className="text-brand-light" />
        <h3 className="mt-6 font-display text-[30px] leading-tight">{s.forTherapists}</h3>
        <ul className="mt-6">
          {s.forTherapistsList.map((item) => (
            <li key={item} className="flex gap-3.5 border-t border-white/12 py-4 text-[16px] leading-snug text-on-hero-2">
              <Angle className="text-brand-light" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** The closing band: the idea in one line, the privacy promise, and the way in. */
function Finale() {
  const { s } = useLanguage()
  const demo = useDemo()
  return (
    <section className="relative isolate overflow-hidden bg-hero-2 text-on-hero ring-1 ring-white/6">
      <LimbLattice mask="[mask-image:radial-gradient(ellipse_60%_100%_at_100%_30%,black_20%,transparent_80%)]" opacity={0.45} />
      <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <h2 className="max-w-[15ch] font-display text-[40px] leading-[1.02] sm:text-[64px]">{s.moveTitle}</h2>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-on-hero-2 sm:text-xl">{s.moveBody}</p>

        <div className="mt-16 grid gap-12 border-t border-white/12 pt-10 lg:grid-cols-2 lg:gap-16">
          <div className="flex max-w-md gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/8 text-brand-light ring-1 ring-white/12">
              <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                <rect x="4" y="9" width="12" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M6.8 9V6.6a3.2 3.2 0 0 1 6.4 0V9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <h3 className="font-bold">{s.privacyTitle}</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-on-hero-2">{s.privacyBody}</p>
            </div>
          </div>

          <div>
            <h3 className="font-display text-[28px] leading-tight">{s.ctaTitle}</h3>
            <p className="mt-2 text-on-hero-2">{s.ctaBody}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link to="/signup" className={`${buttonClass('primary')} group focus-visible:outline-brand-light`}>
                {s.heroCta}
                <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              <button
                type="button"
                disabled={demo.pending != null}
                onClick={() => demo.start('patient')}
                className={buttonClass('on-dark')}
              >
                {demo.pending === 'patient' ? <Spinner /> : <PlayIcon />}
                {s.ctaDemo}
              </button>
            </div>
            <button
              type="button"
              disabled={demo.pending != null}
              onClick={() => demo.start('therapist')}
              className="group mt-5 inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-light underline-offset-4 hover:underline focus-visible:outline-brand-light disabled:opacity-50"
            >
              {demo.pending === 'therapist' && <Spinner />}
              {s.ctaTherapist}
              <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  const { s } = useLanguage()
  return (
    <footer>
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-12 sm:flex-row sm:justify-between">
        <div>
          <Logo to="/welcome" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">{s.builtWith}</p>
        </div>
        <div id="sources" className="max-w-md scroll-mt-24">
          <p className="label-mono text-muted">{s.sources}</p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-sm text-muted marker:font-mono marker:text-xs">
            {s.sourceList.map((src, i) => (
              <li key={src}>
                <a href={SOURCE_URLS[i]} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-ink">
                  {src}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </footer>
  )
}

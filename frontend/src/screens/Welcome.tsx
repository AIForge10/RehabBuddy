import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LanguageToggle } from '../components/LanguageToggle'
import { LegLattice } from '../components/LegLattice'
import { LegMark, Logo, Wordmark } from '../components/Logo'
import { buttonClass } from '../components/Screen'
import { useAuth } from '../lib/auth'
import { useLanguage } from '../lib/language'
import { CoachVisual, MeasureVisual, PlanVisual, ReportVisual } from './welcome/StepVisuals'
import { HeroStage } from './welcome/HeroStage'

// The signed-out front door: what bendwith.us does, for whom, and why it
// matters, then into sign up, log in or the one-tap demo. Copy follows the
// build plan's pitch; stats cite its sources in the footer.

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
        <MoveBand />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}

/** Splash: the leg swings in, the wordmark wipes on, then the page shows through. Tap to skip. */
function Intro({ onDone }: { onDone: () => void }) {
  const { s } = useLanguage()
  return (
    <div
      aria-hidden="true"
      onClick={onDone}
      onAnimationEnd={(e) => e.target === e.currentTarget && onDone()}
      className="fixed inset-0 z-50 grid animate-splash-out place-items-center bg-canvas bg-[radial-gradient(60%_50%_at_50%_45%,var(--rb-wash),transparent_75%)]"
    >
      <div className="flex flex-col items-center px-6 text-center">
        <div className="flex items-center gap-4">
          <LegMark className="h-20 w-auto animate-splash-mark text-brand sm:h-24" />
          <Wordmark className="mt-4 h-10 w-auto animate-splash-word text-ink sm:h-12" />
        </div>
        <p className="mt-7 animate-splash-tag text-xs font-bold uppercase tracking-[0.2em] text-muted sm:text-sm">{s.heroEyebrow}</p>
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
        scrolled ? 'border-line bg-canvas/80 backdrop-blur-xl' : 'border-transparent'
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-3 px-5">
        <Logo to="/welcome" />
        <nav className="flex shrink-0 items-center gap-2 sm:gap-3">
          <LanguageToggle />
          <Link to="/login" className="hidden h-11 items-center rounded-full px-4 font-semibold text-ink-2 transition-colors hover:bg-surface hover:text-ink sm:inline-flex">
            {s.navLogin}
          </Link>
          {/* Phones get the hero's own buttons right below; the header only has room for the language. */}
          <Link to="/signup" className={`${buttonClass('primary', 'md')} h-11 whitespace-nowrap rounded-full px-5 text-[15px] max-sm:!hidden`}>
            {s.navSignup}
          </Link>
        </nav>
      </div>
    </header>
  )
}

function Arrow({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <path d="M4 9h10m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Check({ className = 'text-brand-ink' }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className={`shrink-0 ${className}`}>
      <circle cx="9" cy="9" r="8" fill="currentColor" opacity="0.14" />
      <path d="m5.5 9.2 2.3 2.3 4.7-4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Eyebrow({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  return <p className={`text-xs font-bold uppercase tracking-[0.18em] ${onDark ? 'text-brand-light' : 'text-brand-ink'}`}>{children}</p>
}

function Hero() {
  const { s } = useLanguage()
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-8 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-14 lg:pb-28 lg:pt-16">
      <div className="animate-rise">
        <p className="inline-flex items-center gap-2 rounded-full bg-surface py-1.5 pl-2 pr-3.5 text-[13px] font-semibold text-ink-2 shadow-card ring-1 ring-line">
          <span className="grid size-5 place-items-center rounded-full bg-brand-soft">
            <LegMark className="h-3 w-auto text-brand-ink" />
          </span>
          {s.heroEyebrow}
        </p>
        <h1 className="mt-6 font-display text-[40px] leading-[1.02] sm:text-[56px] lg:text-[62px]">
          {s.heroTitle[0]} <span className="text-brand-ink">{s.heroTitle[1]}</span>
        </h1>
        <p className="mt-5 max-w-[34rem] text-lg leading-relaxed text-ink-2 sm:text-xl">{s.heroSub}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link to="/signup" className={`${buttonClass('primary', 'lg')} group font-display`}>
            {s.heroCta}
            <span className="transition-transform duration-200 group-hover:translate-x-0.5">
              <Arrow />
            </span>
          </Link>
          <Link to="/login" className={buttonClass('secondary', 'lg')}>
            {s.heroSecondary}
          </Link>
        </div>
        <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-ink-2">
          {s.heroPoints.map((p) => (
            <li key={p} className="flex items-center gap-1.5">
              <Check />
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
  // Decorative bars under each stat; the number and sentence carry the meaning.
  const bars = [
    [{ pct: 35, strong: true }],
    [
      { pct: 64, strong: false },
      { pct: 23, strong: true },
    ],
    [],
  ]
  return (
    <section className="border-y border-line bg-surface/55">
      <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
        <div className="max-w-3xl">
          <Eyebrow>{s.problemEyebrow}</Eyebrow>
          <h2 className="mt-4 font-display text-[30px] leading-[1.1] sm:text-[42px]">{s.problemTitle}</h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">{s.problemBody}</p>
        </div>
        <ul className="mt-12 grid gap-4 md:grid-cols-3">
          {s.stats.map((st, i) => (
            <li key={st.value} className="flex flex-col rounded-[28px] bg-surface p-6 shadow-card ring-1 ring-line sm:p-7">
              <p className="font-display text-[44px] leading-none text-brand-ink sm:text-[52px]">{st.value}</p>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
                {st.label}
                <a href="#sources" className="ml-0.5 align-super text-[11px] font-bold text-muted hover:text-ink">
                  [{st.source}]
                </a>
              </p>
              <div aria-hidden="true" className="mt-auto flex flex-col gap-1.5 pt-6">
                {bars[i].length ? (
                  bars[i].map((b) => (
                    <span key={b.pct} className="h-2 overflow-hidden rounded-full bg-brand-track">
                      <span className={`block h-full origin-left animate-grow rounded-full ${b.strong ? 'bg-brand' : 'bg-line-strong'}`} style={{ width: `${b.pct}%` }} />
                    </span>
                  ))
                ) : (
                  <span className="h-2 rounded-full border-2 border-dashed border-line-strong" />
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function HowItWorks() {
  const { s } = useLanguage()
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
      <div className="max-w-2xl">
        <Eyebrow>{s.howEyebrow}</Eyebrow>
        <h2 className="mt-4 font-display text-[30px] leading-[1.1] sm:text-[42px]">{s.howTitle}</h2>
      </div>
      <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {s.howSteps.map((step, i) => {
          const Visual = STEP_VISUALS[i]
          return (
            <li key={step.title} className="flex flex-col rounded-[28px] bg-surface p-4 shadow-card ring-1 ring-line">
              <div aria-hidden="true" className="grid h-44 place-items-center overflow-hidden rounded-[20px] bg-raised ring-1 ring-line ring-inset">
                <Visual />
              </div>
              <div className="px-2 pb-2 pt-5">
                <span className="grid size-8 place-items-center rounded-full bg-brand text-sm font-bold text-on-brand">{i + 1}</span>
                <h3 className="mt-3 text-lg font-bold leading-snug">{step.title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{step.body}</p>
              </div>
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
      <div className="rounded-[32px] bg-surface p-7 shadow-card ring-1 ring-line sm:p-9">
        <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft">
          <LegMark className="h-7 w-auto text-brand-ink" />
        </span>
        <h3 className="mt-5 font-display text-[28px] leading-tight">{s.forPatients}</h3>
        <ul className="mt-5 space-y-3.5">
          {s.forPatientsList.map((item) => (
            <li key={item} className="flex gap-3 text-[16px] leading-snug text-ink-2">
              <Check />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative isolate overflow-hidden rounded-[32px] bg-[linear-gradient(155deg,var(--rb-hero)_0%,var(--rb-hero-2)_100%)] p-7 text-on-hero shadow-lift ring-1 ring-white/6 sm:p-9">
        <LegLattice opacity={0.35} />
        <span className="grid size-12 place-items-center rounded-2xl bg-white/10 text-brand-light ring-1 ring-white/10">
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 19V5m0 14h16M8 15l3.5-4 3 2.5L20 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h3 className="mt-5 font-display text-[28px] leading-tight">{s.forTherapists}</h3>
        <ul className="mt-5 space-y-3.5">
          {s.forTherapistsList.map((item) => (
            <li key={item} className="flex gap-3 text-[16px] leading-snug text-on-hero-2">
              <Check className="text-brand-light" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function MoveBand() {
  const { s } = useLanguage()
  return (
    <section className="px-5 pb-20 lg:pb-28">
      <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-[36px] bg-[linear-gradient(155deg,var(--rb-hero)_0%,var(--rb-hero-2)_100%)] px-6 py-14 text-on-hero shadow-lift ring-1 ring-white/6 sm:px-12 sm:py-20">
        <LegLattice mask="[mask-image:radial-gradient(ellipse_55%_100%_at_100%_50%,black_25%,transparent_80%)]" />
        <h2 className="max-w-[15ch] font-display text-[34px] leading-[1.05] sm:text-[54px]">{s.moveTitle}</h2>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-on-hero-2">{s.moveBody}</p>
        <div className="mt-10 flex max-w-xl gap-4 rounded-3xl bg-white/[0.06] p-5 ring-1 ring-white/10 backdrop-blur-sm sm:p-6">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand text-on-brand">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <rect x="4" y="9" width="12" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M6.8 9V6.6a3.2 3.2 0 0 1 6.4 0V9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <h3 className="font-bold">{s.privacyTitle}</h3>
            <p className="mt-1 text-[15px] leading-relaxed text-on-hero-2">{s.privacyBody}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  const { s } = useLanguage()
  const { demoSignIn } = useAuth()
  const [pending, setPending] = useState(false)
  return (
    <section className="mx-auto max-w-3xl px-5 pb-24 text-center">
      <LegMark className="mx-auto h-16 w-auto animate-float text-brand" />
      <h2 className="mt-6 font-display text-[34px] leading-[1.08] sm:text-[48px]">{s.ctaTitle}</h2>
      <p className="mt-3 text-lg text-ink-2">{s.ctaBody}</p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Link to="/signup" className={`${buttonClass('primary', 'lg')} font-display`}>
          {s.heroCta}
          <Arrow />
        </Link>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setPending(true)
            demoSignIn('patient')
          }}
          className={buttonClass('secondary', 'lg')}
        >
          {s.ctaDemo}
        </button>
      </div>
    </section>
  )
}

function Footer() {
  const { s } = useLanguage()
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-10 sm:flex-row sm:justify-between">
        <div>
          <Logo to="/welcome" />
          <p className="mt-3 max-w-xs text-sm text-muted">{s.builtWith}</p>
        </div>
        <div id="sources" className="max-w-md scroll-mt-24">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">{s.sources}</p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-sm text-muted marker:font-semibold">
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

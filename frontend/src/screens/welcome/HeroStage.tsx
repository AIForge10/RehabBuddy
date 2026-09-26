import { useEffect, useRef, useState } from 'react'
import { ExerciseFigure } from '../../components/ExerciseFigure'
import { Sparkline } from '../../components/Sparkline'
import { EXERCISES } from '../../lib/exercises'
import { useLanguage } from '../../lib/language'
import { useDemoLoop } from '../../lib/useDemoLoop'
import { useReducedMotion } from '../../lib/useReducedMotion'

// The splash hero: the product running on its own. The seated figure bends on
// the briefing loop while the readouts, the rep counter and the coach's cue
// follow it, and a card shows what lands on the therapist's side. The cue is
// the live language, so the EN/ES toggle visibly switches the coach.

const KNEE = EXERCISES.knee
const TARGET = 90
const REPS = 10
/** Deepest bend per session over ten days: the seed's 72° → 88° climb. */
const TREND = [72, 74, 73, 76, 78, 79, 82, 84, 85, 88]
/** Held pose when the OS asks for less motion. */
const STILL = 78

function useRepCount(phase: number) {
  const [reps, setReps] = useState(3)
  const prev = useRef(phase)
  useEffect(() => {
    // A rep lands when the straighten phase hands back to the start.
    if (prev.current === 3 && phase === 0) setReps((r) => (r >= REPS ? 1 : r + 1))
    prev.current = phase
  }, [phase])
  return reps
}

export function HeroStage() {
  const { s, lang } = useLanguage()
  const reduced = useReducedMotion()
  const demo = useDemoLoop(KNEE.rest, TARGET, !reduced)
  const angle = reduced ? STILL : demo.angle
  const phase = reduced ? 2 : demo.phase
  const reps = useRepCount(phase)
  const reached = angle >= TARGET - 2
  const cue = KNEE.copy[lang].steps[phase].title

  return (
    <div className="relative animate-rise [animation-delay:120ms] sm:pb-12">
      <div className="relative aspect-square overflow-hidden rounded-[28px] sm:aspect-[4/3] sm:rounded-[32px] bg-stage shadow-lift ring-1 ring-white/8">
        <div className="absolute inset-x-0 bottom-[72px] top-[92px] sm:bottom-24 sm:top-6">
          <ExerciseFigure exercise={KNEE} angle={angle} target={TARGET} showLabel={false} />
        </div>

        {/* Live readout: Figtree tabular figures so the number doesn't jitter. */}
        <div className="absolute left-3.5 top-3.5 rounded-2xl bg-white/[0.07] px-3.5 py-2.5 ring-1 ring-white/10 backdrop-blur-md sm:left-5 sm:top-5 sm:px-4 sm:py-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
            <span className="relative flex size-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-brand-glow opacity-80" />
              <span className="relative size-1.5 rounded-full bg-brand-glow" />
            </span>
            {s.liveAngle}
          </p>
          <p className="mt-1.5 text-[30px] font-bold leading-none tabular-nums text-white sm:text-[42px]">
            {Math.round(angle)}
            <span className={reached ? 'text-brand-glow' : 'text-white/50'}>°</span>
          </p>
          <p className="mt-1.5 text-xs font-medium text-white/60">
            {s.target} {TARGET}°
          </p>
        </div>

        <div className="absolute right-3.5 top-3.5 rounded-2xl bg-white/[0.07] px-3.5 py-2.5 text-right ring-1 ring-white/10 backdrop-blur-md sm:right-5 sm:top-5 sm:px-4 sm:py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">{s.reps}</p>
          <p className="mt-1.5 text-[22px] font-bold leading-none tabular-nums text-white">
            {reps}
            <span className="text-white/45">/{REPS}</span>
          </p>
        </div>

        <div className="absolute inset-x-3.5 bottom-3.5 flex items-center gap-3 rounded-2xl bg-white/[0.07] p-2.5 pr-4 ring-1 ring-white/10 backdrop-blur-md sm:bottom-5 sm:left-5 sm:right-auto sm:max-w-[54%]">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-on-brand">
            <VoiceBars still={reduced} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-light">{s.coach}</p>
            <p key={cue} aria-live="off" className="animate-rise truncate text-[15px] font-semibold text-white">
              “{cue}”
            </p>
          </div>
        </div>
      </div>

      <TherapistCard />
    </div>
  )
}

/** What the therapist receives: the latest session and the trend behind it. */
function TherapistCard() {
  const { s } = useLanguage()
  const last = TREND[TREND.length - 1]
  return (
    <div className="relative mx-auto mt-4 w-full max-w-[300px] animate-float rounded-[22px] bg-surface p-4 shadow-lift ring-1 ring-line sm:absolute sm:-bottom-12 sm:-right-3 sm:mt-0 sm:w-[256px] lg:-right-8">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{s.heroSent}</p>
        <span className="grid size-6 place-items-center rounded-full bg-brand-soft text-brand-ink">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="m2.5 6.2 2.2 2.2 4.8-4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-[30px] leading-none">{last}°</p>
          <p className="mt-1.5 text-xs font-bold text-good">+{last - TREND[0]}°</p>
        </div>
        <Sparkline values={TREND} target={TARGET} className="w-[120px]" />
      </div>
      <p className="mt-2 text-xs text-muted">{s.heroTrend}</p>
    </div>
  )
}

/** Speaking indicator: five bars breathing out of step. */
function VoiceBars({ still }: { still: boolean }) {
  const bars = [0.45, 0.8, 1, 0.7, 0.4]
  return (
    <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden="true">
      {bars.map((h, i) => (
        <rect
          key={i}
          x={1 + i * 4.3}
          y={9 - (h * 16) / 2}
          width="2.4"
          height={h * 16}
          rx="1.2"
          fill="currentColor"
          className={still ? '' : 'animate-pulse'}
          style={{ animationDelay: `${i * 140}ms`, animationDuration: '900ms' }}
        />
      ))}
    </svg>
  )
}

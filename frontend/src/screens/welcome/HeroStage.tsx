import { useEffect, useRef, useState } from 'react'
import { DegreeScale } from '../../components/DegreeScale'
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
    <div className="relative animate-rise [animation-delay:120ms] sm:pb-16">
      <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-stage ring-1 ring-white/8 min-[440px]:aspect-square">
        <div className="absolute inset-x-0 bottom-[76px] top-[140px] sm:bottom-20 sm:top-[150px]">
          <ExerciseFigure exercise={KNEE} angle={angle} target={TARGET} showLabel={false} />
        </div>
        {/* Scrims keep the readouts legible over the figure without boxing them in. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-stage to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-stage/90 to-transparent" />

        {/* The instrument bar: live angle, reps, and the bend on its scale. Figtree tabular figures so numbers don't jitter. */}
        <div className="absolute inset-x-5 top-5 sm:inset-x-7 sm:top-7">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="label-mono flex items-center gap-2 text-white/60">
                <span className="relative flex size-1.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-brand-glow opacity-80" />
                  <span className="relative size-1.5 rounded-full bg-brand-glow" />
                </span>
                {s.liveAngle}
              </p>
              <p className="mt-2 text-[44px] font-bold leading-none tracking-tight tabular-nums text-white sm:text-[52px]">
                {Math.round(angle)}
                <span className={`font-medium ${reached ? 'text-brand-glow' : 'text-white/40'}`}>°</span>
              </p>
            </div>
            <div className="text-right">
              <p className="label-mono text-white/60">{s.reps}</p>
              <p className="mt-2 text-[28px] font-bold leading-none tabular-nums text-white">
                {reps}
                <span className="text-white/40">/{REPS}</span>
              </p>
            </div>
          </div>
          <DegreeScale value={angle} target={TARGET} min={KNEE.min} max={KNEE.max} onDark className="mt-4" />
        </div>

        <div className="absolute bottom-5 left-5 right-5 flex items-center gap-3 sm:bottom-6 sm:left-6 sm:right-auto sm:max-w-[55%]">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-on-brand">
            <VoiceBars still={reduced} />
          </span>
          <div className="min-w-0">
            <p className="label-mono text-brand-light">{s.coach}</p>
            <p key={cue} aria-live="off" className="mt-0.5 animate-rise truncate text-[16px] font-semibold text-white">
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
    <div className="relative mx-auto mt-4 w-full max-w-[300px] rounded-2xl bg-surface p-4 shadow-lift ring-1 ring-line sm:absolute sm:bottom-0 sm:right-5 sm:mt-0 sm:w-[260px] lg:-right-6">
      <div className="flex items-center justify-between gap-3">
        <p className="label-mono text-muted">{s.heroSent}</p>
        <span className="grid size-5 place-items-center rounded-full bg-brand text-on-brand">
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
            <path d="m2.5 6.2 2.2 2.2 4.8-4.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-[30px] leading-none">{last}°</p>
          <p className="mt-1.5 font-mono text-xs font-semibold text-good">+{last - TREND[0]}°</p>
        </div>
        <Sparkline values={TREND} target={TARGET} className="w-[124px]" />
      </div>
      <p className="mt-2.5 border-t border-line pt-2.5 text-xs text-muted">{s.heroTrend}</p>
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

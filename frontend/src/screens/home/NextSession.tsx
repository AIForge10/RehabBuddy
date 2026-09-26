import { useId } from 'react'
import { LEG_PATH } from '../../components/Logo'
import { useLanguage } from '../../lib/language'
import type { Assignment } from '../../types/session'

/** Today's exercise and the one button that matters. */
export function NextSession({ assignment, onStart }: { assignment: Assignment; onStart: () => void }) {
  const { s } = useLanguage()
  const stats = [
    { value: `${assignment.reps}`, label: s.reps },
    { value: `${assignment.target_angle}°`, label: s.target },
    { value: s.sessionLength, label: s.doneTime },
  ]

  return (
    <section
      aria-labelledby="next-session"
      className="relative isolate flex min-h-[340px] animate-rise flex-col overflow-hidden rounded-[32px] bg-hero bg-[linear-gradient(155deg,var(--rb-hero)_0%,var(--rb-hero-2)_100%)] p-6 text-on-hero shadow-lift ring-1 ring-white/6 sm:min-h-[420px] sm:p-9"
    >
      <LegPattern />
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-light">{s.today}</p>
      <h2 id="next-session" className="mt-3 max-w-[12ch] font-display text-[34px] leading-[1.04] sm:text-[52px]">
        {assignment.exercise.name}
      </h2>

      {/* Equal columns on phones so a long label ("Repeticiones") can't squeeze its neighbours. */}
      <dl className="mt-auto grid grid-cols-3 pt-8 sm:flex">
        {stats.map((st, i) => (
          <div key={st.label} className={`flex min-w-0 flex-col-reverse ${i ? 'border-l border-white/12 pl-4 sm:ml-7 sm:pl-7' : ''}`}>
            <dt className="mt-1.5 truncate text-sm text-on-hero-2">{st.label}</dt>
            <dd className="whitespace-nowrap font-display text-2xl leading-none sm:text-[32px]">{st.value}</dd>
          </div>
        ))}
      </dl>

      <button
        type="button"
        onClick={onStart}
        className="group mt-7 inline-flex h-16 w-full items-center justify-between rounded-2xl bg-brand pl-6 pr-2 font-display text-lg text-on-brand shadow-[0_10px_24px_-16px_var(--rb-brand)] transition-[background-color,box-shadow,transform] duration-200 hover:bg-brand-strong hover:shadow-[0_14px_30px_-14px_var(--rb-brand)] focus-visible:outline-brand-light active:scale-[0.98] sm:mt-8"
      >
        {s.start}
        <span className="grid size-12 place-items-center rounded-xl bg-on-brand text-brand transition-transform duration-200 group-hover:translate-x-0.5">
          <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M4 9h10m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
    </section>
  )
}

/**
 * The cover-art motif: rows of legs on an 8° tilt, the same lattice as the
 * brand thumbnail, fading out of the top-right corner so the copy stays clean.
 */
function LegPattern() {
  const id = useId()
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full text-brand [mask-image:radial-gradient(ellipse_70%_95%_at_100%_22%,black_30%,transparent_78%)] sm:[mask-image:radial-gradient(ellipse_56%_88%_at_100%_30%,black_30%,transparent_80%)]"
    >
      <defs>
        <pattern id={id} width="124" height="148" patternUnits="userSpaceOnUse" patternTransform="rotate(8) translate(24 -18)">
          <path d={LEG_PATH} transform="translate(22 10) scale(0.8)" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} opacity="0.6" />
    </svg>
  )
}

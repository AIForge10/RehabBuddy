import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DEMO_PATIENT_ID, getPatientOverview } from '../api/client'
import { Button, PatientScreen } from '../components/Screen'
import { useLanguage } from '../lib/language'
import type { PatientOverview } from '../types/session'
import { NextSession } from './home/NextSession'
import { Recap } from './home/Recap'

const DAY_MS = 86_400_000
// Next session gets the wider column: it's the one thing to do here.
const GRID = 'grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-6'

export default function Home() {
  const { s } = useLanguage()
  const navigate = useNavigate()
  const [data, setData] = useState<PatientOverview | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    getPatientOverview(DEMO_PATIENT_ID)
      .then((d) => {
        setData(d)
        setError(false)
      })
      .catch(() => setError(true))
  }, [])

  useEffect(load, [load])

  if (error) {
    return (
      <PatientScreen wide>
        <div className="mx-auto mt-16 max-w-md rounded-3xl bg-surface p-8 text-center shadow-card ring-1 ring-line">
          <p className="text-ink-2">{s.loadError}</p>
          <Button variant="secondary" size="md" className="mt-5" onClick={load}>
            {s.retry}
          </Button>
        </div>
      </PatientScreen>
    )
  }

  if (!data) {
    return (
      <PatientScreen wide>
        <div className="mt-6 sm:mt-10" aria-busy="true" aria-label={s.loading}>
          <div className="h-4 w-44 animate-pulse rounded-md bg-line" />
          <div className="mt-2.5 h-10 w-72 max-w-full animate-pulse rounded-xl bg-line" />
          <div className={`mt-8 ${GRID}`}>
            <div className="h-[340px] animate-pulse rounded-[32px] bg-line sm:h-[420px] lg:h-[520px]" />
            <div className="h-[520px] animate-pulse rounded-[32px] bg-line" />
          </div>
        </div>
      </PatientScreen>
    )
  }

  const { patient, assignment, sessions } = data
  const now = new Date()
  const weekStart = new Date(now).setHours(0, 0, 0, 0) - 6 * DAY_MS
  const thisWeek = sessions.filter((x) => Date.parse(x.started_at) >= weekStart).length

  return (
    <PatientScreen wide>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-x-10 gap-y-4 sm:mt-10">
        <div>
          <p className="text-sm font-semibold text-muted first-letter:uppercase">
            {now.toLocaleDateString(s.locale, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="mt-1 font-display text-[34px] leading-[1.08] sm:text-[44px]">{s.greeting(patient.full_name.split(' ')[0], now.getHours())}</h1>
        </div>
        <WeekProgress done={thisWeek} plan={assignment.times_per_week} />
      </div>

      <div className={`mt-6 sm:mt-8 ${GRID}`}>
        <NextSession assignment={assignment} onStart={() => navigate('/session', { state: { assignment } })} />
        <Recap sessions={sessions} target={assignment.target_angle} reps={assignment.reps} />
      </div>

      <p className="mt-10 text-center">
        <Link
          to="/therapist"
          className="inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-muted transition-colors hover:bg-surface hover:text-ink hover:shadow-card"
        >
          {s.therapistLink}
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8h9m-3.5-3.5L12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </p>
    </PatientScreen>
  )
}

/** Sessions in the last 7 days against the weekly plan: one pip per planned session. */
function WeekProgress({ done, plan }: { done: number; plan: number }) {
  const { s } = useLanguage()
  return (
    <div className="flex items-center gap-3 pb-1.5">
      <span className="flex gap-1" aria-hidden="true">
        {Array.from({ length: plan }, (_, i) => (
          <span key={i} className={`h-2 w-5 rounded-full ${i < done ? 'bg-brand' : 'bg-brand-track'}`} />
        ))}
      </span>
      <p className="text-sm font-semibold text-ink-2">{s.weekLine(done, plan)}</p>
    </div>
  )
}

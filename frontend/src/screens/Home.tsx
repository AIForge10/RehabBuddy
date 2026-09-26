import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DEMO_PATIENT_ID, getAssignment } from '../api/client'
import { PatientScreen } from '../components/Screen'
import { useLanguage } from '../lib/language'
import type { Assignment } from '../types/session'

// Display name until there's a /patients/{id} endpoint; the assignment doesn't carry it.
const DEMO_FIRST_NAME = 'Maria'

export default function Home() {
  const { s } = useLanguage()
  const navigate = useNavigate()
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    setError(false)
    getAssignment(DEMO_PATIENT_ID)
      .then(setAssignment)
      .catch(() => setError(true))
  }, [])

  useEffect(load, [load])

  return (
    <PatientScreen>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{s.greeting(DEMO_FIRST_NAME)}</h1>

      <section className="mt-8 rounded-2xl border border-line bg-surface p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{s.today}</p>
        {error ? (
          <div className="mt-3">
            <p className="text-ink-2">{s.loadError}</p>
            <button onClick={load} className="mt-4 rounded-lg border border-line-strong px-4 py-2 text-sm font-medium hover:bg-canvas">
              {s.retry}
            </button>
          </div>
        ) : !assignment ? (
          <p className="mt-3 text-muted">{s.loading}</p>
        ) : (
          <>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">{assignment.exercise.name}</h2>
            <p className="mt-1 text-lg text-ink-2">
              {s.target(assignment.reps, assignment.target_angle)}
              <span className="text-muted"> · {s.frequency(assignment.times_per_week)}</span>
            </p>
            <p className="mt-4 max-w-prose leading-relaxed text-ink-2">{assignment.exercise.instructions}</p>

            <div className="mt-6 border-t border-line pt-5">
              <p className="text-sm font-semibold">{s.setupTitle}</p>
              <ol className="mt-2 space-y-1.5 text-sm text-ink-2">
                {s.setup.map((line, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-4 shrink-0 text-right tabular-nums text-muted">{i + 1}</span>
                    {line}
                  </li>
                ))}
              </ol>
            </div>

            <button
              onClick={() => navigate('/session', { state: { assignment } })}
              className="mt-8 w-full rounded-xl bg-accent px-6 py-4 text-lg font-semibold text-white transition-colors hover:bg-accent-strong sm:w-auto"
            >
              {s.start}
            </button>
          </>
        )}
      </section>

      <p className="mt-10 text-center text-sm text-muted">
        <Link to="/therapist" className="underline decoration-line-strong underline-offset-4 hover:text-ink">
          Therapist dashboard
        </Link>
      </p>
    </PatientScreen>
  )
}

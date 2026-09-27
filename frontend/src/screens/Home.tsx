import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPatientOverview } from '../api/client'
import { Button, PatientScreen, TITLE } from '../components/Screen'
import { exerciseFor } from '../lib/exercises'
import { useAuth } from '../lib/auth'
import { useLanguage } from '../lib/language'
import { planChanges, planOf, type PlanField } from '../lib/plan'
import { weekOf } from '../lib/week'
import type { Assignment, Joint, PatientOverview } from '../types/session'
import { NextSession } from './home/NextSession'
import { PlanNotice } from './home/PlanNotice'
import { Recap } from './home/Recap'
import { WeeklyRecap } from './home/WeeklyRecap'
import { WeekStrip } from './home/WeekStrip'

// Read top to bottom: where the week stands, what to do now, how it's going.
const RECAP_GRID = 'mt-12 grid gap-x-12 gap-y-12 sm:mt-16 lg:grid-cols-12'
const POLL_MS = 4000

export default function Home() {
  const { s, lang } = useLanguage()
  const { account } = useAuth()
  const patientId = account!.id // RequireAuth only renders this screen signed in
  const navigate = useNavigate()
  const [data, setData] = useState<PatientOverview | null>(null)
  const [error, setError] = useState(false)
  const shown = useRef<Assignment | null>(null) // the plan on screen, to notice a therapist's edit
  const [updated, setUpdated] = useState<PlanField[] | null>(null)
  // The brief's joint picker lets a patient do an exercise other than the prescribed one, and
  // each joint keeps its own history. `data` stays the plan's, polled as before; picking another
  // joint fetches that history alongside it, so the week and the plan card never change meaning.
  const [otherJoint, setOtherJoint] = useState<Joint | null>(null)
  const [fetched, setFetched] = useState<PatientOverview | null>(null)

  const load = useCallback(() => {
    getPatientOverview(patientId)
      .then((d) => {
        const changed = shown.current ? planChanges(planOf(shown.current), planOf(d.assignment)) : []
        if (changed.length) setUpdated((u) => [...new Set([...(u ?? []), ...changed])])
        shown.current = d.assignment
        setData(d)
        setError(false)
      })
      // A failed refresh keeps the plan already on screen.
      .catch(() => !shown.current && setError(true))
  }, [])

  useEffect(() => {
    if (!otherJoint) return
    let live = true
    getPatientOverview(patientId, otherJoint)
      .then((d) => live && setFetched(d))
      // Fall back to the plan's history rather than leaving a dead chip selected.
      .catch(() => live && setOtherJoint(null))
    return () => {
      live = false
    }
  }, [otherJoint, patientId])

  // Refresh while the tab is visible, so a plan the therapist changes shows up without a reload.
  useEffect(() => {
    load()
    const id = setInterval(() => !document.hidden && load(), POLL_MS)
    const onVisible = () => !document.hidden && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  if (error) {
    return (
      <PatientScreen wide>
        <div className="mt-16 max-w-md border-t-2 border-ink pt-5">
          <p className="text-lg text-ink-2">{s.loadError}</p>
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
        <div className="pt-6 sm:pt-10" aria-busy="true" aria-label={s.loading}>
          <div className="h-4 w-40 animate-pulse rounded bg-line" />
          <div className="mt-3 h-11 w-80 max-w-full animate-pulse rounded-lg bg-line" />
          <div className="mt-3 h-5 w-96 max-w-full animate-pulse rounded bg-line" />
          <div className="mt-10 h-[520px] animate-pulse rounded-3xl bg-line sm:h-[560px] lg:h-[400px]" />
          <div className={RECAP_GRID}>
            <div className="h-40 animate-pulse rounded-lg bg-line lg:col-span-12" />
            <div className="h-80 animate-pulse rounded-lg bg-line lg:col-span-5 xl:col-span-4" />
            <div className="h-80 animate-pulse rounded-lg bg-line lg:col-span-7 xl:col-span-8" />
          </div>
        </div>
      </PatientScreen>
    )
  }

  const { patient, assignment, sessions } = data
  const now = new Date()
  const week = weekOf(sessions, now, s.weekStartsOn)
  const plan = assignment.times_per_week
  // The history section can show another joint the patient has worked; everything above it
  // (the week, the plan card) stays the prescribed exercise's.
  const planJoint = assignment.exercise.joint as Joint
  const others = data.joints_with_history.filter((j) => j !== planJoint)
  const other = otherJoint && fetched?.joint === otherJoint ? fetched : null
  const history = other ?? data
  const historyJoint = (other ? other.joint : planJoint) as Joint
  const historyExercise = exerciseFor(historyJoint)
  const historyTarget = other ? historyExercise.target : assignment.target_angle
  const chip = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm transition-colors ${
      active ? 'bg-ink text-surface' : 'bg-surface text-ink-2 ring-1 ring-line hover:ring-ink/30'
    }`

  return (
    <PatientScreen wide>
      <div className="flex flex-wrap items-end justify-between gap-x-16 gap-y-8 pt-6 sm:pt-10">
        <div className="max-w-xl">
          <p className="label-mono text-muted">{now.toLocaleDateString(s.locale, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 className={`mt-3 ${TITLE}`}>{s.greeting((account?.full_name ?? patient.full_name).split(' ')[0], now.getHours())}</h1>
          <p className="mt-3 text-lg text-ink-2 sm:text-xl">{data.joints_with_history.length === 0 ? s.firstLede : s.weekLede(week.done, plan, week.daysLeft)}</p>
        </div>
        <WeekStrip week={week} plan={plan} />
      </div>

      <div className="mt-8 space-y-4 sm:mt-10">
        {updated && <PlanNotice changed={updated} assignment={assignment} onDismiss={() => setUpdated(null)} />}
        <NextSession assignment={assignment} onStart={() => navigate('/session', { state: { assignment } })} />
      </div>

      {/* How it's going: the coach's words first, then the numbers behind them. */}
      <div className={RECAP_GRID}>
        <WeeklyRecap overview={data} />
        {others.length > 0 && (
          <div className="lg:col-span-12">
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-mono mr-1 text-muted">{s.historyFor}</span>
              <button type="button" className={chip(!otherJoint)} onClick={() => setOtherJoint(null)}>
                {exerciseFor(planJoint).copy[lang].name} · {s.planJoint}
              </button>
              {others.map((j) => (
                <button key={j} type="button" className={chip(otherJoint === j)} onClick={() => setOtherJoint(j)}>
                  {exerciseFor(j).copy[lang].name}
                </button>
              ))}
            </div>
            {other && <p className="mt-3 text-sm text-ink-2">{s.offPlanNote}</p>}
          </div>
        )}
        <Recap sessions={history.sessions} target={historyTarget} reps={assignment.reps} exercise={historyExercise} />
      </div>

    </PatientScreen>
  )
}

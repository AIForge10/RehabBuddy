import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { getPatientOverview } from '../api/client'
import { RomChart } from '../components/RomChart'
import { Button, PatientScreen } from '../components/Screen'
import { exerciseFor } from '../lib/exercises'
import { formatDuration } from '../lib/format'
import { useLanguage } from '../lib/language'
import type { PatientOverview } from '../types/session'
import type { SessionFlowState } from './PainCheck'

export default function SessionDone() {
  const { s, lang } = useLanguage()
  const navigate = useNavigate()
  const flow = useLocation().state as SessionFlowState | null
  const [overview, setOverview] = useState<PatientOverview | null>(null)

  useEffect(() => {
    if (flow) getPatientOverview(flow.assignment.patient_id).then(setOverview).catch(() => {})
  }, [flow])

  if (!flow) return <Navigate to="/" replace />

  const { result, assignment, pain, sessionId } = flow
  const exercise = exerciseFor(assignment.exercise.joint)
  const copy = exercise.copy[lang]
  const hitTarget = result.max_angle >= assignment.target_angle
  // The overview covers the assigned joint; a session on another joint has no history to compare with.
  const history = overview?.assignment.exercise.joint === assignment.exercise.joint ? overview : null
  const previous = history?.sessions.find((x) => x.id !== sessionId)
  const delta = previous ? result.max_angle - previous.max_angle : null
  const uniqueWarnings = [...new Set(result.form_warnings)]
  const firstName = overview?.patient.full_name.split(' ')[0]

  return (
    <PatientScreen>
      <div className="mt-10 flex flex-col items-center text-center">
        <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true">
          <circle cx="44" cy="44" r="40" className="fill-brand-soft" />
          <circle
            cx="44"
            cy="44"
            r="40"
            fill="none"
            className="animate-draw stroke-brand"
            strokeWidth="4"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            style={{ ['--len' as string]: 100 }}
            transform="rotate(-90 44 44)"
          />
          <path
            d="m28 45 11 10 21-22"
            fill="none"
            className="animate-draw stroke-brand [animation-delay:400ms]"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={100}
            strokeDasharray="100"
            style={{ ['--len' as string]: 100 }}
          />
        </svg>
        <h1 className="mt-5 font-display text-[40px] font-medium leading-[1.05] tracking-tight">{s.doneTitle}</h1>
        <p className="mt-2 h-7 text-lg text-ink-2">{firstName ? s.doneSub(firstName) : ''}</p>
      </div>

      {/* Headline */}
      <section className="mt-8 rounded-[28px] bg-hero bg-[linear-gradient(135deg,var(--rb-hero)_0%,var(--rb-hero-2)_100%)] p-6 text-on-hero shadow-lift sm:p-7">
        <p className="text-sm font-bold text-on-hero-2">{copy.best}</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <p className="text-[72px] font-bold leading-none tracking-tighter tabular-nums">
            {result.max_angle}
            <span className="text-on-hero-2">°</span>
          </p>
          {history && (
            <span className="mb-2 animate-rise whitespace-nowrap rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold ring-1 ring-white/15">
              {delta == null ? s.doneFirst : s.doneVsLast(delta)}
            </span>
          )}
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full origin-left animate-grow rounded-full bg-on-hero" style={{ width: `${Math.max(0, Math.min(1, (result.max_angle - exercise.rest) / (assignment.target_angle - exercise.rest))) * 100}%` }} />
        </div>
        <p className="mt-2.5 text-sm font-semibold text-on-hero-2">
          {hitTarget ? s.goalHit : s.toGo(assignment.target_angle - result.max_angle)} · {s.target} {assignment.target_angle}°
        </p>
      </section>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        <Stat label={s.doneReps} value={`${result.reps_done}`} unit={`/${assignment.reps}`} />
        <Stat label={s.doneTime} value={formatDuration(result.duration_sec)} />
        <Stat
          label={s.doneForm}
          value={uniqueWarnings.length ? `${result.form_warnings.length}` : s.doneFormClean}
          tone={uniqueWarnings.length ? 'warn' : 'good'}
          sub={uniqueWarnings[0]}
        />
      </dl>

      {history && history.sessions.length > 1 && (
        <section className="mt-4 animate-rise rounded-[28px] bg-surface p-5 shadow-card ring-1 ring-line">
          <h2 className="text-lg font-bold">{s.doneProgress}</h2>
          <p className="text-sm text-muted">{copy.bestSub}</p>
          <div className="mt-3">
            <RomChart sessions={history.sessions} target={assignment.target_angle} compact highlightLatest />
          </div>
        </section>
      )}

      {pain && (
        <p
          className={`mt-6 flex items-center gap-2.5 rounded-2xl px-4 py-3 text-[15px] font-bold ring-1 ${
            pain.response.flagged ? 'bg-critical-soft text-critical ring-critical/20' : 'bg-brand-soft text-brand-ink ring-brand/15'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
            {pain.response.flagged ? (
              <>
                <circle cx="8" cy="8" r="7" fill="currentColor" />
                <path d="M8 4.5v4.2M8 11v.3" className="stroke-critical-soft" strokeWidth="1.8" strokeLinecap="round" />
              </>
            ) : (
              <path d="M14.5 1.5 7 9M14.5 1.5 10 14.5 7 9 1.5 6l13-4.5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            )}
          </svg>
          {pain.response.flagged ? s.painFlagged : s.doneSent}
        </p>
      )}

      <Button onClick={() => navigate('/')} className="mt-6 w-full">
        {s.backHome}
      </Button>
    </PatientScreen>
  )
}

function Stat({ label, value, unit, sub, tone }: { label: string; value: string; unit?: string; sub?: string; tone?: 'warn' | 'good' }) {
  return (
    <div className="rounded-3xl bg-surface p-4 shadow-card ring-1 ring-line">
      <dt className="text-xs font-bold text-ink-2">{label}</dt>
      <dd className={`mt-1 text-2xl font-bold tracking-tight tabular-nums ${tone === 'warn' ? 'text-warn' : tone === 'good' ? 'text-good' : ''}`}>
        {value}
        {unit && <span className="text-base font-medium text-muted">{unit}</span>}
      </dd>
      {sub && <dd className="mt-0.5 truncate text-xs text-muted">{sub}</dd>}
    </div>
  )
}

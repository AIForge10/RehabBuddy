import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { getPatientOverview } from '../api/client'
import { DegreeScale } from '../components/DegreeScale'
import { FormNotes } from '../components/FormNotes'
import { PainDot, Row, Rows, Section } from '../components/Ledger'
import { RomChart } from '../components/RomChart'
import { Button, PatientScreen, TITLE } from '../components/Screen'
import { exerciseFor } from '../lib/exercises'
import { formatDuration } from '../lib/format'
import { useLanguage } from '../lib/language'
import type { PatientOverview } from '../types/session'
import type { SessionFlowState } from './PainCheck'

// The session's result on the same ruled layout as the home recap: the
// deepest bend on its scale and the facts beside it, then where it sits in
// the trend and confirmation that the therapist has it.

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
  const target = assignment.target_angle
  const hitTarget = result.max_angle >= target
  // The overview covers the assigned joint; a session on another joint has no history to compare with.
  const history = overview?.assignment.exercise.joint === assignment.exercise.joint ? overview : null
  const previous = history?.sessions.find((x) => x.id !== sessionId)
  const delta = previous ? result.max_angle - previous.max_angle : null
  const firstName = overview?.patient.full_name.split(' ')[0]

  return (
    <PatientScreen wide>
      <div className="flex items-center gap-5 pt-6 sm:pt-10">
        <svg width="64" height="64" viewBox="0 0 88 88" aria-hidden="true" className="shrink-0">
          <circle cx="44" cy="44" r="40" className="fill-brand-soft" />
          <circle
            cx="44"
            cy="44"
            r="40"
            fill="none"
            className="animate-draw stroke-brand"
            strokeWidth="5"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            style={{ ['--len' as string]: 100 }}
            transform="rotate(-90 44 44)"
          />
          <path
            d="m28 45 11 10 21-22"
            fill="none"
            className="animate-draw stroke-brand-ink [animation-delay:400ms]"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={100}
            strokeDasharray="100"
            style={{ ['--len' as string]: 100 }}
          />
        </svg>
        <div className="min-w-0">
          <h1 className={TITLE}>{s.doneTitle}</h1>
          <p className="mt-1.5 h-7 text-lg text-ink-2">{firstName ? s.doneSub(firstName) : ''}</p>
        </div>
      </div>

      <div className="mt-12 grid gap-x-12 gap-y-12 sm:mt-14 lg:grid-cols-12">
        <Section title={copy.name} className="lg:col-span-5 xl:col-span-4">
          <p className="label-mono mt-6 text-muted">{copy.best}</p>
          <p className="mt-2 font-display text-[88px] leading-none">
            {result.max_angle}
            <span className="text-muted">°</span>
          </p>
          <DegreeScale value={result.max_angle} target={target} min={exercise.min} max={exercise.max} className="mt-5" />
          <p className="mt-3 truncate text-[15px] font-semibold">
            <span className={hitTarget ? 'text-good' : 'text-brand-ink'}>{hitTarget ? s.goalHit : s.toGo(target - result.max_angle)}</span>
            {history && (
              <span className="animate-rise text-muted">
                <span aria-hidden="true"> · </span>
                {delta == null ? s.doneFirst : s.doneVsLast(delta)}
              </span>
            )}
          </p>

          <Rows className="mt-6">
            <Row label={s.doneReps}>
              {result.reps_done}
              <span className="font-medium text-muted"> / {assignment.reps}</span>
            </Row>
            <Row label={s.doneTime}>{formatDuration(result.duration_sec)}</Row>
            <Row label={s.doneForm}>
              <FormNotes warnings={result.form_warnings} />
            </Row>
            {pain && (
              <Row label={s.pain}>
                <PainDot score={pain.score} />
                {pain.score}
                <span className="font-medium text-muted"> / 10</span>
              </Row>
            )}
          </Rows>
        </Section>

        <div className="flex flex-col gap-8 lg:col-span-7 xl:col-span-8">
          <Section title={s.doneProgress} aside={<span className="font-medium text-muted">{copy.bestSub}</span>} className="flex-1">
            {history && history.sessions.length > 1 ? (
              <div className="mt-5 animate-rise">
                <RomChart sessions={history.sessions} target={target} targetLabel={`${s.target} ${target}°`} compact highlightLatest />
              </div>
            ) : (
              <p className="mt-4 max-w-[36ch] text-lg text-ink-2">{history ? s.oneMore : ''}</p>
            )}
          </Section>

          <div className="space-y-4">
            {pain && (
              <p
                className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-[15px] font-bold ring-1 ${
                  pain.response.flagged ? 'bg-critical-soft text-critical ring-critical/20' : 'bg-brand-soft text-brand-ink ring-brand/20'
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
            <Button onClick={() => navigate('/')} className="w-full sm:w-auto sm:px-10">
              {s.backHome}
            </Button>
          </div>
        </div>
      </div>
    </PatientScreen>
  )
}

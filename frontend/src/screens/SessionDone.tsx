import { useEffect, useId, useState, type CSSProperties } from 'react'
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
import { useReducedMotion } from '../lib/useReducedMotion'
import type { PatientOverview } from '../types/session'
import type { SessionFlowState } from './PainCheck'

// The session's result on the same ruled layout as the home recap: the
// deepest bend on its scale and the facts beside it, then where it sits in
// the trend and confirmation that the therapist has it.
//
// The header sets the tone. After a pain check that went to the therapist (or
// a session stopped because it hurt) it's calm and leads with rest, and the
// angle steps back. The first session ever to reach the target gets its own
// moment. Otherwise it's the usual check mark.

const DAY_MS = 86_400_000

export default function SessionDone() {
  const { s, lang } = useLanguage()
  const navigate = useNavigate()
  const flow = useLocation().state as SessionFlowState | null
  const [overview, setOverview] = useState<PatientOverview | null>(null)
  const [loaded, setLoaded] = useState(false)
  // Day N of the recovery, counted as on the therapist's dashboard so both say the same day.
  const [day, setDay] = useState<number | null>(null)

  useEffect(() => {
    if (flow)
      getPatientOverview(flow.assignment.patient_id)
        .then((o) => {
          setOverview(o)
          const since = Date.now() - Date.parse(o.patient.start_date)
          if (Number.isFinite(since)) setDay(Math.max(1, Math.round(since / DAY_MS)))
        }, () => {})
        .finally(() => setLoaded(true))
  }, [flow])

  if (!flow) return <Navigate to="/" replace />

  const { result, assignment, pain, sessionId } = flow
  const exercise = exerciseFor(assignment.exercise.joint)
  const copy = exercise.copy[lang]
  const target = assignment.target_angle
  const hitTarget = result.max_angle >= target
  // The overview covers the assigned joint; a session on another joint has no history to compare with.
  const history = overview?.assignment.exercise.joint === assignment.exercise.joint ? overview : null
  const earlier = history?.sessions.filter((x) => x.id !== sessionId)
  const previous = earlier?.[0] // most recent first
  const delta = previous ? result.max_angle - previous.max_angle : null
  const firstName = overview?.patient.full_name.split(' ')[0]

  const hurt = Boolean(pain?.response.flagged || flow.stoppedForPain)
  const milestone = !hurt && hitTarget && earlier != null && earlier.every((x) => x.max_angle < target)
  // A session that reached the target might be the first ever; until the
  // history says, hold the header back so a check mark doesn't turn into the
  // milestone a moment later.
  const header = hurt ? 'rest' : milestone ? 'milestone' : hitTarget && !loaded ? 'pending' : 'done'

  const painRow = pain && (
    <Row label={s.pain}>
      <PainDot score={pain.score} />
      {pain.score}
      <span className="font-medium text-muted"> / 10</span>
    </Row>
  )

  return (
    <PatientScreen wide>
      <div key={header} className={`flex items-center gap-5 pt-6 sm:pt-10 ${header === 'pending' ? 'invisible' : ''}`}>
        {header === 'rest' ? <RestMark /> : header === 'milestone' ? <MilestoneMark /> : <CheckMark />}
        <div className="min-w-0">
          {header === 'milestone' && <p className="label-mono mb-2 text-brand-ink">{s.milestone}</p>}
          <h1 className={TITLE}>{header === 'rest' ? s.doneRestTitle : header === 'milestone' ? s.milestoneTitle(target) : s.doneTitle}</h1>
          <p className="mt-1.5 min-h-7 text-lg text-ink-2">
            {header === 'rest'
              ? flow.demo
                ? s.doneRestSubLocal
                : s.doneRestSub
              : [header === 'milestone' && day != null ? s.milestoneDay(day) : '', firstName ? s.doneSub(firstName) : '']
                  .filter(Boolean)
                  .join(' ')}
          </p>
        </div>
      </div>

      <div className="mt-12 grid gap-x-12 gap-y-12 sm:mt-14 lg:grid-cols-12">
        <Section title={copy.name} className="lg:col-span-5 xl:col-span-4">
          <p className="label-mono mt-6 text-muted">{copy.best}</p>
          <p className={`mt-2 font-display leading-none ${hurt ? 'text-[56px] text-ink-2' : 'text-[88px]'}`}>
            {result.max_angle}
            <span className="text-muted">°</span>
          </p>
          <DegreeScale value={result.max_angle} target={target} min={exercise.min} max={exercise.max} className="mt-5" />
          <p className="mt-3 truncate text-[15px] font-semibold">
            <span className={hurt ? 'text-ink-2' : hitTarget ? 'text-good' : 'text-brand-ink'}>
              {milestone ? s.milestoneGoal : hitTarget ? s.goalHit : s.toGo(target - result.max_angle)}
            </span>
            {/* Not after pain: a session cut short is lower than the last, and saying so doesn't help. */}
            {history && !milestone && !hurt && (
              <span className="animate-rise text-muted">
                <span aria-hidden="true"> · </span>
                {delta == null ? s.doneFirst : s.doneVsLast(delta)}
              </span>
            )}
          </p>

          <Rows className="mt-6">
            {/* After a flagged check-in the pain comes first. */}
            {hurt && painRow}
            <Row label={s.doneReps}>
              {result.reps_done}
              <span className="font-medium text-muted"> / {assignment.reps}</span>
            </Row>
            <Row label={s.doneTime}>{formatDuration(result.duration_sec)}</Row>
            <Row label={s.doneForm}>
              <FormNotes warnings={result.form_warnings} />
            </Row>
            {!hurt && painRow}
          </Rows>
        </Section>

        <div className="flex flex-col gap-8 lg:col-span-7 xl:col-span-8">
          <Section title={s.doneProgress} aside={<span className="font-medium text-muted">{copy.bestSub}</span>} className="flex-1">
            {history && history.sessions.length > 1 ? (
              <div className="mt-5 animate-rise">
                <RomChart sessions={history.sessions} target={target} targetLabel={`${s.target} ${target}°`} locale={s.locale} compact highlightLatest />
              </div>
            ) : (
              <p className="mt-4 max-w-[36ch] text-lg text-ink-2">{history ? s.oneMore : ''}</p>
            )}
          </Section>

          <div className="space-y-4">
            {flow.demo && <p className="label-mono text-muted">{flow.unsaved ? s.notSaved : s.demoNotSaved}</p>}
            {pain && !flow.demo && (
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

/** The usual finish: a ring and a check that draw themselves on. */
function CheckMark() {
  return (
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
  )
}

/** After a flagged check-in: a still crescent moon for rest. Nothing moves, nothing celebrates. */
function RestMark() {
  const mask = useId()
  return (
    <svg width="64" height="64" viewBox="0 0 88 88" aria-hidden="true" className="shrink-0">
      <circle cx="44" cy="44" r="40" className="fill-raised stroke-line-strong" strokeWidth="1.5" />
      <mask id={mask}>
        <rect width="88" height="88" fill="white" />
        <circle cx="54" cy="35" r="15" fill="black" />
      </mask>
      <circle cx="43" cy="46" r="19" className="fill-ink-2" mask={`url(#${mask})`} />
    </svg>
  )
}

// The milestone's burst, played once. Defined here rather than in index.css
// because nothing else uses it. With reduced motion the mark is drawn in its
// final state: solid disc, check, and rays already out.
const MILESTONE_KEYFRAMES = `
@keyframes milestone-disc { from { transform: scale(0.4); opacity: 0 } 60% { transform: scale(1.08); opacity: 1 } }
@keyframes milestone-ring { from { transform: scale(1); opacity: 0.55 } to { transform: scale(1.75); opacity: 0 } }
@keyframes milestone-ray { from { transform: rotate(var(--a)) translateY(10px) scaleY(0.2); opacity: 0 } }
`
const RAYS = Array.from({ length: 12 }, (_, i) => i * 30)

/** The first time at the target: a solid disc that pops in, a ring that ripples out once, and rays around it. */
function MilestoneMark() {
  const reduced = useReducedMotion()
  const play = (animation: string): CSSProperties | undefined => (reduced ? undefined : { animation })
  return (
    <svg width="80" height="80" viewBox="0 0 120 120" aria-hidden="true" className="shrink-0 overflow-visible">
      {!reduced && <style>{MILESTONE_KEYFRAMES}</style>}
      {!reduced && (
        <circle
          cx="60"
          cy="60"
          r="34"
          fill="none"
          className="stroke-brand"
          strokeWidth="3"
          style={{ transformOrigin: '60px 60px', ...play('milestone-ring 1100ms cubic-bezier(0.2, 0.7, 0.2, 1) 350ms both') }}
        />
      )}
      {RAYS.map((a, i) => (
        <line
          key={a}
          x1="60"
          y1={i % 2 ? 13 : 9}
          x2="60"
          y2="19"
          className={i % 2 ? 'stroke-brand-light' : 'stroke-brand'}
          strokeWidth={i % 2 ? 3 : 4}
          strokeLinecap="round"
          style={{
            transformOrigin: '60px 60px',
            transform: `rotate(${a}deg)`,
            ['--a' as string]: `${a}deg`,
            ...play(`milestone-ray 700ms cubic-bezier(0.2, 0.7, 0.2, 1) ${450 + (i % 3) * 60}ms both`),
          }}
        />
      ))}
      <g style={{ transformOrigin: '60px 60px', ...play('milestone-disc 600ms cubic-bezier(0.3, 1.3, 0.5, 1) both') }}>
        <circle cx="60" cy="60" r="34" className="fill-brand" />
        <path
          d="m44 61 11 10 21-22"
          fill="none"
          className="stroke-on-brand"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={100}
          strokeDasharray="100"
          style={{ ['--len' as string]: 100, ...play('draw 700ms cubic-bezier(0.6, 0, 0.2, 1) 300ms both') }}
        />
      </g>
    </svg>
  )
}

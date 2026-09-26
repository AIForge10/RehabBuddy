import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { DEMO_PATIENT_ID, createSession, getAssignment } from '../api/client'
import { AngleGauge } from '../components/AngleGauge'
import { PatientScreen } from '../components/Screen'
import { playCue, stopCoach, type CoachCue } from '../lib/coach'
import { formatDuration } from '../lib/format'
import { useLanguage } from '../lib/language'
import { useSimulatedPose } from '../lib/simulatedPose'
import { useCamera } from '../lib/useCamera'
import type { AngleSample, Assignment, SessionResult } from '../types/session'

const SAMPLE_MS = 100 // ~10 Hz into angle_samples
const COUNTDOWN = 3

type Phase = 'countdown' | 'running' | 'saving'

export default function ExerciseSession() {
  const { s, lang } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const [assignment, setAssignment] = useState<Assignment | null>(
    (location.state as { assignment?: Assignment } | null)?.assignment ?? null,
  )
  const { videoRef, status: camera } = useCamera()
  const [phase, setPhase] = useState<Phase>('countdown')
  const [count, setCount] = useState(COUNTDOWN)
  const [elapsed, setElapsed] = useState(0)
  const [caption, setCaption] = useState<string | null>(null)
  const [saveError, setSaveError] = useState(false)

  // Pose source. The real tracker plugs in here once src/pose/usePose is ready:
  //   const tracked = usePose(videoRef)
  //   const pose = demo ? simulated : tracked
  // Demo mode stays as the on-stage fallback if the camera fails.
  const [demo, setDemo] = useState(true)
  const target = assignment?.target_angle ?? 90
  const simulated = useSimulatedPose(phase === 'running' && demo, target)
  const pose = demo ? simulated : { angle: null, reps: 0, form_warning: null, confidence: 0 }

  useEffect(() => {
    if (!assignment) getAssignment(DEMO_PATIENT_ID).then(setAssignment).catch(() => navigate('/'))
  }, [assignment, navigate])

  // Recording state lives in refs so the 10 Hz sampler doesn't re-render.
  const poseRef = useRef(pose)
  const langRef = useRef(lang)
  useEffect(() => {
    poseRef.current = pose
    langRef.current = lang
  })
  const rec = useRef({
    startedAt: new Date(),
    t0: 0,
    samples: [] as AngleSample[],
    max: 0,
    repPeak: 0,
    warnings: [] as string[],
  })

  const say = useCallback((cue: CoachCue) => setCaption(playCue(cue, langRef.current)), [])

  // 3-2-1 so the patient can get into position.
  useEffect(() => {
    if (phase !== 'countdown' || !assignment) return
    if (count === 0) {
      rec.current.startedAt = new Date()
      rec.current.t0 = performance.now()
      setPhase('running')
      say('start')
      return
    }
    const id = setTimeout(() => setCount((c) => c - 1), 900)
    return () => clearTimeout(id)
  }, [phase, count, assignment, say])

  useEffect(() => {
    if (phase !== 'running') return
    const id = setInterval(() => {
      const r = rec.current
      const a = poseRef.current.angle
      if (a == null) return
      const angle = Math.round(a * 10) / 10
      r.samples.push({ t_ms: Math.round(performance.now() - r.t0), angle })
      r.max = Math.max(r.max, angle)
      r.repPeak = Math.max(r.repPeak, angle)
    }, SAMPLE_MS)
    const clock = setInterval(() => setElapsed(Math.floor((performance.now() - rec.current.t0) / 1000)), 250)
    return () => {
      clearInterval(id)
      clearInterval(clock)
    }
  }, [phase])

  const finish = useCallback(async () => {
    if (!assignment) return
    const r = rec.current
    setPhase('saving')
    setSaveError(false)
    const result: SessionResult = {
      reps_done: poseRef.current.reps,
      max_angle: Math.round(r.max),
      form_warnings: r.warnings,
      duration_sec: Math.round((performance.now() - r.t0) / 1000),
      samples: r.samples,
    }
    try {
      const { session_id } = await createSession({
        ...result,
        assignment_id: assignment.id,
        patient_id: assignment.patient_id,
        started_at: r.startedAt.toISOString(),
      })
      navigate('/pain-check', { state: { sessionId: session_id, result, assignment } })
    } catch {
      setSaveError(true)
      setPhase('running')
    }
  }, [assignment, navigate])

  // Coach reacts to each completed rep.
  const lastReps = useRef(0)
  useEffect(() => {
    if (!assignment || pose.reps <= lastReps.current) return
    lastReps.current = pose.reps
    const peak = rec.current.repPeak
    rec.current.repPeak = 0
    const goal = assignment.reps
    if (pose.reps >= goal) {
      say('done')
      const id = setTimeout(finish, 1500)
      return () => clearTimeout(id)
    }
    if (pose.reps === goal - 1) say('last_rep')
    else if (pose.reps === Math.floor(goal / 2)) say('halfway')
    else if (peak < assignment.target_angle - 10) say('bend_deeper')
    else say('good_rep')
  }, [pose.reps, assignment, say, finish])

  // ...and to each new form problem.
  const lastWarning = useRef<string | null>(null)
  useEffect(() => {
    const w = pose.form_warning
    if (w && w !== lastWarning.current) {
      rec.current.warnings.push(w)
      say('knee_in')
    }
    lastWarning.current = w
  }, [pose.form_warning, say])

  useEffect(() => stopCoach, [])

  const goal = assignment?.reps ?? 10
  const angle = pose.angle
  const reached = angle != null && angle >= target - 2

  return (
    <PatientScreen wide>
      <div className="mt-2 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Camera */}
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-ink">
          <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
          {camera !== 'on' && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/70">
              {camera === 'starting' ? s.cameraStarting : s.cameraDenied}
            </div>
          )}

          <div className="absolute left-3 top-3 flex gap-2">
            <button
              onClick={() => setDemo((d) => !d)}
              className={`rounded-full px-3 py-1 text-xs font-semibold backdrop-blur ${
                demo ? 'bg-white/90 text-ink' : 'bg-black/40 text-white/80'
              }`}
              aria-pressed={demo}
            >
              {s.demoMode}
            </button>
          </div>

          {phase === 'countdown' && assignment && (
            <div className="absolute inset-0 grid place-items-center bg-black/35">
              <span className="text-8xl font-semibold tabular-nums text-white">{count || ''}</span>
            </div>
          )}

          {phase !== 'countdown' && angle == null && (
            <div className="absolute inset-x-0 bottom-0 bg-black/60 px-4 py-3 text-center text-sm text-white">{s.legHidden}</div>
          )}

          {pose.form_warning && (
            <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-xl bg-warn-soft px-4 py-3 text-sm font-medium text-warn">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
                <path d="M8 1.5 15 14H1L8 1.5Z" fill="currentColor" />
                <path d="M8 6v3.5M8 11.5v.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              {pose.form_warning}
            </div>
          )}
        </div>

        {/* Readout */}
        <aside className="flex flex-col rounded-2xl border border-line bg-surface p-6">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium text-ink-2">{s.kneeBend}</p>
            <p className="text-sm tabular-nums text-muted">{formatDuration(elapsed)}</p>
          </div>
          <p className={`mt-1 text-7xl font-semibold tracking-tight tabular-nums ${reached ? 'text-accent' : 'text-ink'}`}>
            {angle == null ? '—' : Math.round(angle)}
            <span className="text-5xl font-normal text-muted">°</span>
          </p>
          <p className="text-sm text-muted">{s.targetShort(target)}</p>

          <div className="mx-auto mt-4 w-full max-w-64 px-2">
            <AngleGauge angle={angle} target={target} />
          </div>

          <div className="mt-5 border-t border-line pt-5">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium text-ink-2">{s.reps}</p>
              <p className="text-2xl font-semibold tabular-nums">
                {pose.reps}
                <span className="text-base font-normal text-muted"> / {goal}</span>
              </p>
            </div>
            <div className="mt-3 flex gap-0.5" aria-hidden="true">
              {Array.from({ length: goal }, (_, i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${i < pose.reps ? 'bg-accent' : 'bg-line'}`} />
              ))}
            </div>
          </div>

          <div className="mt-5 flex min-h-16 gap-3 rounded-xl bg-canvas p-4" aria-live="polite">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="mt-0.5 shrink-0 text-accent">
              <path d="M2 7v4h3l4 3.5v-11L5 7H2Z" fill="currentColor" />
              <path d="M12 6.2a4 4 0 0 1 0 5.6M14.2 4a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p className="text-[15px] leading-snug text-ink">{caption ?? s.coachIdle}</p>
          </div>

          {saveError && <p className="mt-4 text-sm text-critical">{s.saveError}</p>}

          <div className="mt-auto pt-6">
            <button
              onClick={finish}
              disabled={phase !== 'running'}
              className="w-full rounded-xl border border-line-strong px-5 py-3.5 font-semibold transition-colors hover:bg-canvas disabled:opacity-50"
            >
              {phase === 'saving' ? s.saving : s.finish}
            </button>
          </div>
        </aside>
      </div>
    </PatientScreen>
  )
}

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { createSession } from '../../api/client'
import { AngleGauge } from '../../components/AngleGauge'
import { AngleTrace } from '../../components/AngleTrace'
import { LanguageToggle } from '../../components/LanguageToggle'
import { ExerciseFigure } from '../../components/ExerciseFigure'
import { playCue, stopCoach, type CoachCue } from '../../lib/coach'
import type { Exercise } from '../../lib/exercises'
import { formatDuration } from '../../lib/format'
import { useLanguage } from '../../lib/language'
import { useSimulatedPose } from '../../lib/simulatedPose'
import type { CameraStatus } from '../../lib/useCamera'
import type { AngleSample, Assignment, LivePoseState, SessionResult } from '../../types/session'

import { usePoseSession, type JointName } from '../../pose'

const SAMPLE_MS = 100 // ~10 Hz into angle_samples
const COUNTDOWN = 3

// Real MediaPipe Pose Landmarker is wired and active.
const POSE_READY = true

type Phase = 'countdown' | 'running' | 'saving'

export function Live({
  assignment,
  exercise,
  camera,
  attach,
}: {
  assignment: Assignment
  exercise: Exercise
  camera: CameraStatus
  attach: (el: HTMLVideoElement | null) => void
}) {
  const { s, lang } = useLanguage()
  const copy = exercise.copy[lang]
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('countdown')
  const [count, setCount] = useState(COUNTDOWN)
  const [elapsed, setElapsed] = useState(0)
  const [caption, setCaption] = useState<string | null>(null)
  const [trace, setTrace] = useState<AngleSample[]>([])
  const [best, setBest] = useState(0)
  const [saveError, setSaveError] = useState(false)
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)

  const handleVideoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      setVideoEl(el)
      attach(el)
    },
    [attach],
  )

  const target = assignment.target_angle
  const goal = assignment.reps

  const trackedSession = usePoseSession({
    joint: exercise.part as JointName,
    targetAngle: target,
    targetReps: goal,
    externalVideo: camera === 'on' ? videoEl : null,
  })

  const simulated = !POSE_READY || camera !== 'on' || !trackedSession.ready
  const simulatedPose = useSimulatedPose(phase === 'running' && simulated, exercise, target)

  const trackedPose: LivePoseState = {
    angle: trackedSession.angle,
    reps: trackedSession.reps,
    form_warning: trackedSession.lastRep?.warnings[0] ?? null,
    confidence: trackedSession.confidence,
  }

  const pose = simulated ? simulatedPose : trackedPose

  const poseRef = useRef(pose)
  const langRef = useRef(lang)
  const exerciseRef = useRef(exercise)
  useEffect(() => {
    poseRef.current = pose
    langRef.current = lang
    exerciseRef.current = exercise
  })
  const rec = useRef({ startedAt: new Date(), t0: 0, samples: [] as AngleSample[], max: 0, repPeak: 0, warnings: [] as string[] })

  const say = useCallback((cue: CoachCue) => setCaption(playCue(cue, langRef.current, exerciseRef.current)), [])

  useEffect(() => {
    if (phase !== 'countdown') return
    if (count === 0) {
      rec.current.startedAt = new Date()
      rec.current.t0 = performance.now()
      setPhase('running')
      say('start')
      return
    }
    const id = setTimeout(() => setCount((c) => c - 1), 900)
    return () => clearTimeout(id)
  }, [phase, count, say])

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
      setTrace(r.samples.slice(-130))
      setBest(Math.round(r.max))
    }, SAMPLE_MS)
    const clock = setInterval(() => setElapsed(Math.floor((performance.now() - rec.current.t0) / 1000)), 250)
    return () => {
      clearInterval(id)
      clearInterval(clock)
    }
  }, [phase])

  const finish = useCallback(async () => {
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
        joint: exercise.part,
      })
      navigate('/pain-check', { state: { sessionId: session_id, result, assignment } })
    } catch {
      setSaveError(true)
      setPhase('running')
    }
  }, [assignment, exercise, navigate])

  // Coach reacts to each completed rep...
  const lastReps = useRef(0)
  useEffect(() => {
    if (pose.reps <= lastReps.current) return
    lastReps.current = pose.reps
    const peak = rec.current.repPeak
    rec.current.repPeak = 0
    if (pose.reps >= goal) {
      say('done')
      const id = setTimeout(finish, 1500)
      return () => clearTimeout(id)
    }
    if (pose.reps === goal - 1) say('last_rep')
    else if (pose.reps === Math.floor(goal / 2)) say('halfway')
    else if (peak < target - 10) say('bend_deeper')
    else say('good_rep')
  }, [pose.reps, goal, target, say, finish])

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

  const angle = pose.angle
  const reached = angle != null && angle >= target - 2
  const exit = () => {
    stopCoach()
    navigate('/')
  }

  return (
    <div className="relative h-dvh overflow-hidden bg-stage text-white">
      {/* Feed */}
      <video
        ref={handleVideoRef}
        muted
        playsInline
        className={`absolute inset-0 h-full w-full -scale-x-100 object-cover ${camera === 'on' ? '' : 'hidden'}`}
      />
      {camera === 'on' && trackedSession.ready && (
        <canvas ref={trackedSession.canvasRef} className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-cover" />
      )}
      {camera !== 'on' && (
        <div className="absolute inset-0 flex items-center justify-center pb-40 pt-20 lg:pb-8 lg:pr-[360px]">
          <div className="aspect-[16/10] w-full max-w-4xl">
            <ExerciseFigure exercise={exercise} angle={angle} target={target} showLabel={false} />
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/70 to-transparent" />

      {/* Top bar */}
      <header className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={exit}
            aria-label={s.exit}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 ring-1 ring-white/15 backdrop-blur-xl transition-colors hover:bg-white/20"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 4 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <div className="min-w-0">
            <p className="truncate font-bold">{copy.name}</p>
            <p className="flex items-center gap-1.5 text-sm tabular-nums text-white/65">
              <span className={`size-1.5 rounded-full ${phase === 'running' ? 'animate-pulse bg-critical' : 'bg-white/40'}`} />
              {formatDuration(elapsed)}
              {simulated && <span className="label-mono ml-1.5 hidden rounded-full bg-white/10 px-2 py-0.5 text-[10px] sm:inline">{s.simulated}</span>}
            </p>
          </div>
        </div>
        <LanguageToggle onDark />
      </header>

      {/* Angle panel (desktop: right rail) */}
      <aside className="absolute right-5 top-24 hidden w-[340px] lg:block">
        <Glass className="p-5">
          <div className="flex items-center justify-between">
            <p className="label-mono text-white/60">{copy.angleLabel}</p>
            <span className={`label-mono rounded-full bg-brand-glow px-2.5 py-1 text-[10px] text-stage transition-opacity duration-300 ${reached ? 'opacity-100' : 'opacity-0'}`}>
              {s.reached}
            </span>
          </div>
          <div className="mx-auto mt-3 max-w-64">
            <AngleGauge angle={angle} target={target} min={exercise.min} max={exercise.max} name={copy.angleLabel} onDark>
              <BigAngle angle={angle} reached={reached} />
            </AngleGauge>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-center">
            <MiniStat label={s.target} value={`${target}°`} />
            <MiniStat label={s.best} value={best ? `${best}°` : '—'} accent={best >= target - 2} />
          </dl>
          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="label-mono text-white/55">{s.liveAngle}</p>
            <div className="mt-2">
              <AngleTrace samples={trace} target={target} min={exercise.min} onDark />
            </div>
          </div>
        </Glass>
      </aside>

      {/* Countdown */}
      {phase === 'countdown' && (
        <div className="absolute inset-0 grid place-items-center bg-stage/60 backdrop-blur-sm">
          <div className="text-center">
            <div className="relative mx-auto size-40">
              <span key={`ring-${count}`} aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-brand-glow/30 [animation-iteration-count:1]" />
              <div key={count} className="relative grid size-40 animate-pop place-items-center rounded-full bg-brand-glow text-8xl font-bold tabular-nums text-stage shadow-[0_0_80px_-10px_var(--rb-brand-glow)]">
                {count || '·'}
              </div>
            </div>
            <p className="mt-7 font-display text-2xl font-medium text-white/90">{s.getReady}</p>
          </div>
        </div>
      )}

      {/* Bottom HUD */}
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
        <div className="mb-4 flex flex-col items-center gap-2 lg:pr-[360px]">
          {pose.form_warning && (
            <div className="flex animate-rise items-center gap-2 rounded-full bg-warn-soft px-4 py-2 text-sm font-semibold text-warn shadow-lg">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
                <path d="M8 1.5 15 14H1L8 1.5Z" fill="currentColor" />
                <path d="M8 6v3.5M8 11.5v.5" className="stroke-warn-soft" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              {pose.form_warning}
            </div>
          )}
          {saveError && (
            <p role="alert" className="animate-rise rounded-full bg-critical-soft px-4 py-2 text-sm font-bold text-critical shadow-lg">
              {s.saveError}
            </p>
          )}
          {phase !== 'countdown' && angle == null && <p className="rounded-full bg-black/60 px-4 py-2 text-sm backdrop-blur-md">{copy.hidden}</p>}
          {caption && phase !== 'countdown' && (
            <p
              key={caption}
              aria-live="polite"
              className="flex max-w-2xl animate-rise items-center gap-3 rounded-2xl bg-black/55 px-5 py-3 text-center text-lg font-medium backdrop-blur-xl sm:text-xl"
            >
              <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0 text-brand-glow">
                <path d="M2 7v4h3l4 3.5v-11L5 7H2Z" fill="currentColor" />
                <path d="M12 6.2a4 4 0 0 1 0 5.6M14.2 4a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {caption}
            </p>
          )}
        </div>

        <div className="flex items-end gap-3">
          {/* Reps */}
          <Glass className="w-full p-4 sm:p-5 lg:w-[360px]">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="label-mono text-white/60">{s.reps}</p>
                <p className="mt-1 text-6xl font-bold leading-none tracking-tighter tabular-nums sm:text-7xl">
                  <span key={pose.reps} className="inline-block animate-pop">
                    {pose.reps}
                  </span>
                  <span className="text-2xl font-medium tracking-tight text-white/45 sm:text-3xl"> / {goal}</span>
                </p>
              </div>
              {/* Compact angle for small screens */}
              <div className="text-right lg:hidden">
                <p className="label-mono text-white/60">{copy.angleLabel}</p>
                <BigAngle angle={angle} reached={reached} small />
                <p className="label-mono mt-1 text-white/55">
                  {s.target} {target}°
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-1" aria-hidden="true">
              {Array.from({ length: goal }, (_, i) => (
                <span key={i} className={`h-2 flex-1 rounded-full transition-colors duration-300 ${i < pose.reps ? 'bg-brand-glow' : 'bg-white/15'}`} />
              ))}
            </div>
          </Glass>

          <div className="ml-auto hidden flex-col items-end gap-2 lg:flex">
            <button
              onClick={finish}
              disabled={phase !== 'running'}
              className="h-14 rounded-xl bg-white px-7 text-[17px] font-bold text-stage shadow-[0_12px_32px_-12px_rgb(0_0_0/0.6)] transition-[transform,opacity,background-color] hover:bg-white/90 active:scale-[0.98] disabled:opacity-40"
            >
              {phase === 'saving' ? s.saving : s.finish}
            </button>
          </div>
        </div>

        <button
          onClick={finish}
          disabled={phase !== 'running'}
          className="mt-3 h-14 w-full rounded-xl bg-white/12 text-[17px] font-bold ring-1 ring-white/20 backdrop-blur-xl transition-[transform,opacity,background-color] active:scale-[0.98] active:bg-white/20 disabled:opacity-40 lg:hidden"
        >
          {phase === 'saving' ? s.saving : s.finish}
        </button>
      </div>
    </div>
  )
}

function Glass({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl bg-black/45 ring-1 ring-white/10 backdrop-blur-2xl ${className}`}>{children}</section>
}

function BigAngle({ angle, reached, small = false }: { angle: number | null; reached: boolean; small?: boolean }) {
  return (
    <p
      className={`font-bold leading-none tracking-tighter tabular-nums transition-colors ${reached ? 'text-brand-glow' : 'text-white'} ${
        small ? 'mt-1 text-5xl' : 'text-[64px]'
      }`}
    >
      {angle == null ? '—' : Math.round(angle)}
      <span className={`font-normal text-white/45 ${small ? 'text-3xl' : 'text-[40px]'}`}>°</span>
    </p>
  )
}

function MiniStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.06] py-2.5">
      <dt className="label-mono text-[10px] text-white/55">{label}</dt>
      <dd className={`mt-0.5 text-lg font-bold tabular-nums ${accent ? 'text-brand-glow' : ''}`}>{value}</dd>
    </div>
  )
}

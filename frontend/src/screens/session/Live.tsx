import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { USE_MOCKS, createSession } from '../../api/client'
import { AngleGauge } from '../../components/AngleGauge'
import { AngleTrace } from '../../components/AngleTrace'
import { LanguageToggle } from '../../components/LanguageToggle'
import { ExerciseFigure } from '../../components/ExerciseFigure'
import { countCue, playCue, preloadCues, stopCoach, untilCoachQuiet, type CoachCue } from '../../lib/coach'
import type { BodyPart, Exercise } from '../../lib/exercises'
import { formatDuration } from '../../lib/format'
import { warningCue, warningLabel } from '../../lib/formWarnings'
import { useLanguage } from '../../lib/language'
import { useStopRequest } from '../../lib/listen'
import { darkStatusBar } from '../../lib/native'
import { REACHED_WITHIN } from '../../lib/replay'
import { useLivePublisher } from '../../lib/useLivePublisher'
import { useSimulatedPose } from '../../lib/simulatedPose'
import { useRandomSelector } from '../../lib/useRandomSelector'
import type { CameraStatus } from '../../lib/useCamera'
import type { AngleSample, Assignment, LivePoseState, SessionResult } from '../../types/session'
import { painQuestion, warm } from '../pain/say'

import { usePoseSession, type JointName } from '../../pose'

const SAMPLE_MS = 100 // ~10 Hz for the on-screen trace
const COUNTDOWN = 3

// Real MediaPipe Pose Landmarker is wired and active.
const POSE_READY = true

// The coach's "step back so your leg is visible" is only true of these.
const LEGS: ReadonlySet<BodyPart> = new Set(['knee', 'hip'])

type Phase = 'countdown' | 'running' | 'saving'

/** The last four reps each took about as long as their average (within 15%). */
function steadyPace(landedAt: number[]): boolean {
  if (landedAt.length < 5) return false
  const last = landedAt.slice(-5)
  const gaps = last.slice(1).map((t, i) => t - last[i])
  const mean = gaps.reduce((a, b) => a + b) / gaps.length
  return gaps.every((g) => Math.abs(g - mean) <= mean * 0.15)
}

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

  const finishPose = trackedSession.finish
  const simulated = !POSE_READY || camera !== 'on' || !trackedSession.ready
  const simulatedPose = useSimulatedPose(phase === 'running' && simulated, exercise, target)

  const trackedPose: LivePoseState = {
    angle: trackedSession.angle,
    reps: trackedSession.reps,
    rep_warnings: trackedSession.lastRep?.warnings ?? [],
    form_warning: trackedSession.fault,
    confidence: trackedSession.confidence,
  }

  const pose = simulated ? simulatedPose : trackedPose

  const poseRef = useRef(pose)
  const langRef = useRef(lang)
  // Read at finish time: whether this session ran on simulated angles (no camera).
  const simulatedRef = useRef(false)
  const exerciseRef = useRef(exercise)
  useEffect(() => {
    poseRef.current = pose
    simulatedRef.current = simulated
    langRef.current = lang
    exerciseRef.current = exercise
  })
  const rec = useRef({
    startedAt: new Date(),
    t0: 0,
    samples: [] as AngleSample[],
    max: 0,
    /** The current rep's deepest reading, and whether the coach has said "hold" on it. */
    repPeak: 0,
    held: false,
    warnings: [] as string[],
  })

  // The therapist can watch from their dashboard while this runs: angles, reps and cues, never video.
  const { connected: liveShared, end: endLive } = useLivePublisher({
    patientId: assignment.patient_id,
    joint: exercise.part,
    target,
    goal,
    active: phase !== 'countdown',
    read: () => ({
      startedAt: rec.current.startedAt,
      elapsedMs: performance.now() - rec.current.t0,
      samples: rec.current.samples,
      reps: poseRef.current.reps,
      maxAngle: rec.current.max,
      warning: poseRef.current.form_warning,
    }),
  })

  // Set when the patient says it hurts: from then on the coach says nothing else.
  const stoppedForPain = useRef(false)

  /** Speaks a cue and captions it. False when the coach was mid-line and let this one go. */
  const say = useCallback((cue: CoachCue) => {
    if (stoppedForPain.current && cue !== 'pain_stop') return false
    const line = playCue(cue, langRef.current, exerciseRef.current)
    if (line) setCaption(line)
    return line != null
  }, [])

  // Clips load during the countdown, so the first cue doesn't wait on the network.
  useEffect(() => preloadCues(lang, exercise, goal), [lang, exercise, goal])

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
      setTrace(r.samples.slice(-130))
      setBest(Math.round(r.max))
    }, SAMPLE_MS)
    const clock = setInterval(() => setElapsed(Math.floor((performance.now() - rec.current.t0) / 1000)), 250)
    return () => {
      clearInterval(id)
      clearInterval(clock)
    }
  }, [phase])

  const saving = useRef(false)
  const finish = useCallback(async () => {
    // The Finish button, the last rep's timer and a pain stop can all land at once: save once.
    if (saving.current) return
    saving.current = true
    const r = rec.current
    setPhase('saving')
    setSaveError(false)
    // Every tracked frame since "go" goes to the angle_samples hypertable (the
    // tracker also ran through the countdown). Without a camera it saw nothing,
    // so the simulated trace stands in.
    const since = r.startedAt.toISOString()
    const tracked = finishPose().angle_samples.filter((p) => p.time >= since)
    const result: SessionResult = {
      reps_done: poseRef.current.reps,
      max_angle: Math.round(r.max),
      form_warnings: r.warnings,
      duration_sec: Math.round((performance.now() - r.t0) / 1000),
      angle_samples: tracked.length
        ? tracked
        : r.samples.map((p) => ({ time: new Date(r.startedAt.getTime() + p.t_ms).toISOString(), angle: p.angle })),
    }
    try {
      // Demo mode (no camera) runs on simulated angles. It is shown and streamed
      // live, but never saved against the real backend: a fake 92° session would
      // change what the therapist sees for everyone. Mock mode keeps saving, since
      // its data lives in this browser only.
      const demo = simulatedRef.current && !USE_MOCKS
      const session_id = demo
        ? `demo-${r.startedAt.getTime()}`
        : (
            await createSession({
              ...result,
              assignment_id: assignment.id,
              patient_id: assignment.patient_id,
              started_at: r.startedAt.toISOString(),
              joint: exercise.part,
            })
          ).session_id
      const pain = stoppedForPain.current
      endLive(pain ? 'pain' : 'finished') // after the save, so the therapist's dashboard can already load it
      // The pain check's question is voiced now, while the coach's last line
      // plays, so that screen has the audio the moment it asks.
      void warm(painQuestion(exercise, langRef.current, pain), langRef.current)
      // The coach's last line ("Session complete", or stopping for pain) ends before the pain check speaks.
      await untilCoachQuiet()
      navigate('/pain-check', { state: { sessionId: session_id, result, assignment, stoppedForPain: pain, demo } })
    } catch {
      saving.current = false
      setSaveError(true)
      setPhase('running')
    }
  }, [assignment, exercise, navigate, finishPose, endLive])
  // For timers, which would otherwise call the finish of the render that set them.
  const finishRef = useRef(finish)
  useEffect(() => {
    finishRef.current = finish
  })

  // "It hurts" or "stop" (lib/listen.ts): the coach says it's stopping and
  // telling the therapist, the session is saved as it stands, and the live view
  // ends saying why. Saying it again after a failed save tries the save again.
  const stopForPain = useCallback(() => {
    if (!stoppedForPain.current) {
      stoppedForPain.current = true
      say('pain_stop')
    }
    void finishRef.current()
  }, [say])
  const listening = useStopRequest(phase === 'running', lang, stopForPain)

  const getRandomEncouragement = useRandomSelector<CoachCue>([
    'good_rep',
    'nicely_done',
    'good_job',
    'great_control',
    //'smooth_movement', Doesn't sound good
    'keep_it_up',
    'perfect_form',
    'looking_good',
  ])
  const getRandomTargetHit = useRandomSelector<CoachCue>([
    'target_hit',
    'great_depth',
    'full_range',
  ])
  const getRandomNearMiss = useRandomSelector<CoachCue>([
    'push_a_bit_more',
    'almost_there',
  ])
  const getRandomSpeedCorrection = useRandomSelector<CoachCue>([
    'slow_down',
    'control_the_return',
  ])
  const getRandomLastRep = useRandomSelector<CoachCue>([
    'final_rep',
    'last_rep',
  ])
  const getRandomFinish = useRandomSelector<CoachCue>([
    'done',
    'session_complete',
  ])

  const angle = pose.angle

  // Every frame: the rep's deepest point so far, and "hold" the first time the
  // rep reaches the target, as the brief asks for a second's pause there. Once
  // per rep; if the coach is mid-line, it tries again while they're still there.
  useEffect(() => {
    if (phase !== 'running' || angle == null) return
    const r = rec.current
    r.repPeak = Math.max(r.repPeak, angle)
    if (!r.held && pose.reps < goal && angle >= target - REACHED_WITHIN) r.held = say('hold')
  }, [angle, phase, pose.reps, goal, target, say])

  // Coach reacts to each completed rep, like a therapist counting along: it
  // says the rep's number unless something is worth saying instead. First
  // match wins: the finish, a rushed rep, the last rep and halfway, a rep that
  // fell short, three on target in a row, reaching the target after missing
  // it, a controlled rep after a rushed one, and once a session, a steady pace.
  // Corrections don't repeat rep after rep: in between, the coach counts.
  const coached = useRef({
    reps: 0,
    streak: 0,
    missed: true, // so the first rep on target is praised
    depthAt: -Infinity,
    speedAt: -Infinity,
    fastAt: -Infinity,
    rhythm: false,
    landedAt: [] as number[],
  })
  useEffect(() => {
    const c = coached.current
    const n = pose.reps
    if (n <= c.reps) return
    c.reps = n
    const r = rec.current
    const peak = r.repPeak
    r.repPeak = 0
    r.held = false
    // Read through the ref: as a dependency, a new array every render would rerun
    // this effect and cancel the finish timer below.
    const warnings = poseRef.current.rep_warnings
    r.warnings.push(...warnings)
    if (n >= goal) {
      say(getRandomFinish())
      const id = setTimeout(() => finishRef.current(), 1500)
      return () => clearTimeout(id)
    }

    const tooFast = warnings.includes('too_fast')
    const reached = peak >= target - REACHED_WITHIN
    const missedBefore = c.missed
    c.missed = !reached
    c.streak = reached && !tooFast ? c.streak + 1 : 0
    if (tooFast) c.fastAt = n
    c.landedAt.push(performance.now())

    let cue: CoachCue
    if (tooFast && n - c.speedAt >= 2) {
      c.speedAt = n
      cue = getRandomSpeedCorrection()
    } else if (n === goal - 1) cue = getRandomLastRep()
    else if (n === Math.floor(goal / 2)) cue = 'halfway'
    else if (!reached && n - c.depthAt >= 3) {
      c.depthAt = n
      // Within 10° is the rep counter's "deep enough", just not all the way.
      cue = peak < target - 10 ? 'bend_deeper' : getRandomNearMiss()
    } else if (c.streak === 3) cue = 'streak'
    else if (reached && !tooFast && missedBefore) cue = getRandomTargetHit()
    else if (c.speedAt === n - 1 && !tooFast) cue = getRandomEncouragement()
    else if (!c.rhythm && n - c.fastAt > 4 && steadyPace(c.landedAt)) {
      c.rhythm = true
      cue = 'great_rhythm'
    } else cue = countCue(n) ?? getRandomEncouragement()
    say(cue)
    // The pickers are fresh functions every render but pick the same way; the rest is read through refs.
  }, [pose.reps, goal, target, say])

  // Camera visibility watchdog: after a few seconds without a clear view, ask
  // them to step back when the limb has left the frame, or to get into full
  // view when it's there but hard to make out.
  const lastLostTime = useRef<number | null>(null)
  const lastSpokeLost = useRef<number>(0)
  useEffect(() => {
    if (phase !== 'running' || camera !== 'on') return
    const now = Date.now()
    if (pose.angle == null || (pose.confidence != null && pose.confidence < 0.3)) {
      if (!lastLostTime.current) lastLostTime.current = now
      else if (now - lastLostTime.current > 3500) {
        if (now - lastSpokeLost.current > 15000) {
          lastSpokeLost.current = now
          say(pose.angle == null && LEGS.has(exerciseRef.current.part) ? 'step_back' : 'reposition')
        }
      }
    } else {
      lastLostTime.current = null
    }
  }, [pose.angle, pose.confidence, phase, camera, say])

  // ...and to each form fault as it appears. A fault that clears and comes back
  // counts again; one seen before "go" (getting into position) or after the
  // last rep (it would cut off "Session complete") doesn't count.
  const lastWarning = useRef<string | null>(null)
  useEffect(() => {
    const w = pose.form_warning
    const fresh = w != null && w !== lastWarning.current
    lastWarning.current = w
    if (!fresh || phase !== 'running' || pose.reps >= goal) return
    rec.current.warnings.push(w)
    const cue = warningCue(w)
    if (cue) say(cue)
  }, [pose.form_warning, pose.reps, goal, phase, say])

  useEffect(() => stopCoach, [])

  // The stage is always dark, whatever the phone's theme.
  useEffect(() => {
    void darkStatusBar(true)
    return () => void darkStatusBar(false)
  }, [])

  const reached = angle != null && angle >= target - REACHED_WITHIN
  const exit = () => {
    stopCoach()
    endLive('exited')
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

      {/* Top bar. The insets keep it clear of the notch and Dynamic Island in the mobile app; they're 0 in a browser tab. */}
      <header className="absolute left-[env(safe-area-inset-left)] right-[env(safe-area-inset-right)] top-[env(safe-area-inset-top)] flex items-center justify-between gap-3 p-4 sm:p-5">
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
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm tabular-nums text-white/65">
              <span className={`size-1.5 rounded-full ${phase === 'running' ? 'animate-pulse bg-critical' : 'bg-white/40'}`} />
              {formatDuration(elapsed)}
              {simulated && <span className="label-mono ml-1.5 inline rounded-full bg-white/10 px-2 py-0.5 text-[10px]">{s.simulated}</span>}
              {liveShared && <span className="label-mono ml-1.5 hidden rounded-full bg-white/10 px-2 py-0.5 text-[10px] sm:inline">{s.liveShared}</span>}
              {listening && (
                <span className="inline-flex max-w-full animate-rise items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80 sm:ml-1.5">
                  <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-brand-glow">
                    <rect x="5" y="1" width="6" height="9.5" rx="3" fill="currentColor" />
                    <path d="M2.5 7.5a5.5 5.5 0 0 0 11 0M8 13v2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  <span className="min-w-0 truncate">{s.listening}</span>
                </span>
              )}
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

      {/* Bottom HUD, above the home indicator */}
      <div className="absolute bottom-[env(safe-area-inset-bottom)] left-[env(safe-area-inset-left)] right-[env(safe-area-inset-right)] p-4 sm:p-5">
        <div className="mb-4 flex flex-col items-center gap-2 lg:pr-[360px]">
          {pose.form_warning && phase !== 'countdown' && (
            <div className="flex animate-rise items-center gap-2 rounded-full bg-warn-soft px-4 py-2 text-sm font-semibold text-warn shadow-lg">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
                <path d="M8 1.5 15 14H1L8 1.5Z" fill="currentColor" />
                <path d="M8 6v3.5M8 11.5v.5" className="stroke-warn-soft" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              {warningLabel(pose.form_warning, lang)}
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

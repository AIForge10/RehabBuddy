// everything an exercise screen needs, in one hook.
// Camera + MediaPipe + angle + rep counting + session result.
//
//   const pose = usePoseSession({ joint: 'knee', targetAngle: 90, targetReps: 10,
//                                 onRep: (r) => playCue(r), onComplete: (res) => save(res) })
//   <PoseCamera pose={pose} />
//   pose.angle, pose.reps, pose.fault, pose.finish()
import { useCallback, useRef, useState } from 'react'
import { usePose, type PoseFrame, type PreferredSide } from './usePose'
import { RepCounter, type RepWarning } from './repCounter'
import { JOINTS, type FormFault, type JointName } from './joints'
import type { PoseTuning } from './tracker'

export interface RepInfo {
  count: number
  peak: number
  warnings: RepWarning[]
}

export interface PoseSessionResult {
  joint: JointName
  reps_done: number
  max_angle: number
  /** Every rep warning and form fault, one entry per occurrence, in order. */
  form_warnings: (RepWarning | FormFault)[]
  duration_sec: number
  angle_samples: { time: string; angle: number }[]
}

export interface PoseSessionOptions {
  joint?: JointName
  preferredSide?: PreferredSide
  externalVideo?: HTMLVideoElement | null
  /** Overrides for DEFAULT_TUNING in tracker.ts (tune them on /pose-debug). */
  tuning?: Partial<PoseTuning>
  targetAngle?: number // from the therapist's plan; defaults to the joint's default
  targetReps?: number // when reached, onComplete fires automatically
  onRep?: (rep: RepInfo) => void
  onComplete?: (result: PoseSessionResult) => void
}

export function usePoseSession(opts: PoseSessionOptions = {}) {
  const joint = opts.joint ?? 'knee'
  const cfg = JOINTS[joint]
  const targetAngle = opts.targetAngle ?? cfg.target

  const makeCounter = () =>
    new RepCounter({
      bentThreshold: cfg.bent,
      straightThreshold: cfg.straight,
      targetAngle,
      minValidMs: 450,
      minRepMs: 1200,
    })

  const counter = useRef(makeCounter())
  const samples = useRef<{ time: string; angle: number }[]>([])
  const warnings = useRef<(RepWarning | FormFault)[]>([])
  const lastFault = useRef<FormFault | null>(null)
  const startedAt = useRef(Date.now())
  const done = useRef(false)
  const optsRef = useRef(opts)
  optsRef.current = opts
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [angle, setAngle] = useState<number | null>(null)
  const [reps, setReps] = useState(0)
  const [lastRep, setLastRep] = useState<RepInfo | null>(null)
  const [visible, setVisible] = useState(false)
  const [confidence, setConfidence] = useState(0)
  const [activeSide, setActiveSide] = useState<PoseFrame['side']>(null)
  const [fault, setFault] = useState<FormFault | null>(null)

  const buildResult = useCallback((): PoseSessionResult => {
    const c = counter.current
    return {
      joint,
      reps_done: c.count,
      max_angle: Math.round(c.maxAngle * 10) / 10,
      form_warnings: [...warnings.current],
      duration_sec: Math.round((Date.now() - startedAt.current) / 1000),
      angle_samples: samples.current,
    }
  }, [joint])

  const onFrame = (f: PoseFrame) => {
    drawOverlay(canvasRef.current, f, counter.current.isBent)
    setVisible(f.angle != null)
    setAngle(f.angle == null ? null : Math.round(f.angle))
    setConfidence(f.confidence)
    setActiveSide(f.side)
    // A fault counts once each time it appears, however long it lasts: the
    // tracker's hysteresis decides when it has really cleared.
    const seen = f.form?.active ? f.form.fault : null
    if (seen !== lastFault.current) {
      lastFault.current = seen
      setFault(seen)
      if (seen && !done.current) warnings.current.push(seen)
    }
    if (f.angle == null || done.current) return

    samples.current.push({ time: new Date().toISOString(), angle: Math.round(f.angle * 10) / 10 })
    const ev = counter.current.update(f.angle, f.timeMs)
    if (ev.type === 'rep') {
      const info = { count: ev.count, peak: Math.round(ev.peak), warnings: ev.warnings }
      warnings.current.push(...ev.warnings)
      setReps(ev.count)
      setLastRep(info)
      optsRef.current.onRep?.(info)
      const target = optsRef.current.targetReps
      if (target && ev.count >= target) {
        done.current = true
        optsRef.current.onComplete?.(buildResult())
      }
    }
  }

  const { videoRef, ready, error } = usePose({
    joint,
    preferredSide: opts.preferredSide,
    externalVideo: opts.externalVideo,
    tuning: opts.tuning,
    onFrame,
  })

  /** Call from an "End session" button. Returns the result object to save. */
  const finish = useCallback(() => {
    done.current = true
    return buildResult()
  }, [buildResult])

  const reset = useCallback(() => {
    counter.current = makeCounter()
    samples.current = []
    warnings.current = []
    lastFault.current = null
    startedAt.current = Date.now()
    done.current = false
    setReps(0)
    setLastRep(null)
    setFault(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joint, targetAngle])

  return {
    videoRef,
    canvasRef,
    ready,
    error,
    angle,
    reps,
    lastRep,
    /** The form fault the camera sees right now, or null. */
    fault,
    visible,
    confidence,
    activeSide,
    joint,
    targetAngle,
    tip: cfg.tip,
    finish,
    reset,
  }
}

export type PoseSession = ReturnType<typeof usePoseSession>

// The canvas takes the video's own resolution, so with the same object-fit as the
// video (cover, fill, ...) the two always crop and scale identically.
function drawOverlay(canvas: HTMLCanvasElement | null, f: PoseFrame, bent: boolean) {
  const ctx = canvas?.getContext('2d')
  if (!ctx || !canvas) return
  if (canvas.width !== f.videoWidth || canvas.height !== f.videoHeight) {
    canvas.width = f.videoWidth
    canvas.height = f.videoHeight
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!f.points) return
  const scale = canvas.width / 640
  const pts = f.points.map((p) => [p.x * canvas.width, p.y * canvas.height] as const)
  ctx.globalAlpha = f.held ? 0.45 : 1
  ctx.strokeStyle = bent ? '#f59e0b' : '#5eb5a6'
  ctx.lineWidth = 6 * scale
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(...pts[0])
  ctx.lineTo(...pts[1])
  ctx.lineTo(...pts[2])
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  for (const [x, y] of pts.slice(f.anchor === 'vertical' ? 1 : 0)) {
    ctx.beginPath()
    ctx.arc(x, y, 8 * scale, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

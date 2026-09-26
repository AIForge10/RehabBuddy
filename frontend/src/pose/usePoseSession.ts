// everything an exercise screen needs, in one hook.
// Camera + MediaPipe + angle + rep counting + session result.
//
//   const pose = usePoseSession({ joint: 'knee', targetAngle: 90, targetReps: 10,
//                                 onRep: (r) => playCue(r), onComplete: (res) => save(res) })
//   <PoseCamera pose={pose} />
//   pose.angle, pose.reps, pose.finish()
import { useCallback, useRef, useState } from 'react'
import { usePose, type PoseFrame } from './usePose'
import { RepCounter } from './repCounter'
import { JOINTS, type JointName } from './joints'

export interface RepInfo {
  count: number
  peak: number
  warnings: string[]          // 'not_deep_enough' | 'too_fast'
}

export interface PoseSessionResult {
  joint: JointName
  reps_done: number
  max_angle: number
  form_warnings: string[]
  duration_sec: number
  angle_samples: { time: string; angle: number }[]
}

export interface PoseSessionOptions {
  joint?: JointName
  targetAngle?: number        // from the therapist's plan; defaults to the joint's default
  targetReps?: number         // when reached, onComplete fires automatically
  onRep?: (rep: RepInfo) => void
  onComplete?: (result: PoseSessionResult) => void
}

export function usePoseSession(opts: PoseSessionOptions = {}) {
  const joint = opts.joint ?? 'knee'
  const cfg = JOINTS[joint]
  const targetAngle = opts.targetAngle ?? cfg.target

  const makeCounter = () =>
    new RepCounter({ bentThreshold: cfg.bent, straightThreshold: cfg.straight, targetAngle })

  const counter = useRef(makeCounter())
  const samples = useRef<{ time: string; angle: number }[]>([])
  const startedAt = useRef(Date.now())
  const done = useRef(false)
  const optsRef = useRef(opts)
  optsRef.current = opts
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [angle, setAngle] = useState<number | null>(null)
  const [reps, setReps] = useState(0)
  const [lastRep, setLastRep] = useState<RepInfo | null>(null)
  const [visible, setVisible] = useState(false)

  const buildResult = useCallback((): PoseSessionResult => {
    const c = counter.current
    return {
      joint,
      reps_done: c.count,
      max_angle: Math.round(c.maxAngle * 10) / 10,
      form_warnings: [...new Set(c.warnings)],
      duration_sec: Math.round((Date.now() - startedAt.current) / 1000),
      angle_samples: samples.current,
    }
  }, [joint])

  const onFrame = (f: PoseFrame) => {
    drawOverlay(canvasRef.current, f, counter.current.isBent)
    setVisible(f.angle != null)
    setAngle(f.angle == null ? null : Math.round(f.angle))
    if (f.angle == null || done.current) return

    samples.current.push({ time: new Date().toISOString(), angle: Math.round(f.angle * 10) / 10 })
    const ev = counter.current.update(f.angle, f.timeMs)
    if (ev.type === 'rep') {
      const info = { count: ev.count, peak: Math.round(ev.peak), warnings: ev.warnings }
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

  const { videoRef, ready, error } = usePose(joint, onFrame)

  /** Call from an "End session" button. Returns the result object to save. */
  const finish = useCallback(() => {
    done.current = true
    return buildResult()
  }, [buildResult])

  const reset = useCallback(() => {
    counter.current = makeCounter()
    samples.current = []
    startedAt.current = Date.now()
    done.current = false
    setReps(0)
    setLastRep(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joint, targetAngle])

  return {
    videoRef, canvasRef, ready, error,
    angle, reps, lastRep, visible,
    joint, targetAngle, tip: cfg.tip,
    finish, reset,
  }
}

export type PoseSession = ReturnType<typeof usePoseSession>

function drawOverlay(canvas: HTMLCanvasElement | null, f: PoseFrame, bent: boolean) {
  const ctx = canvas?.getContext('2d')
  if (!ctx || !canvas) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!f.points) return
  const pts = f.points.map((p) => [p.x * canvas.width, p.y * canvas.height] as const)
  ctx.strokeStyle = bent ? '#f59e0b' : '#5eb5a6'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(...pts[0]); ctx.lineTo(...pts[1]); ctx.lineTo(...pts[2])
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill() }
}

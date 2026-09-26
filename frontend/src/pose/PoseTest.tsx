// Private pose test page: http://localhost:5173/pose-test.html
// Not part of the real app — app screens are untouched.
import { useEffect, useRef, useState } from 'react'
import { usePose, type PoseFrame } from './usePose'
import { RepCounter } from './repCounter'
import { JOINTS, type JointName } from './joints'
// Local type for this test page only, so it keeps compiling even if the shared
// contract in ../types/session.ts changes. Compare the two before the hand-off.
interface TestSessionResult {
  joint: JointName
  reps_done: number
  max_angle: number
  form_warnings: string[]
  duration_sec: number
  angle_samples: { time: string; angle: number }[]
}

const W = 640, H = 480

function makeCounter(j: JointName) {
  const c = JOINTS[j]
  return new RepCounter({ bentThreshold: c.bent, straightThreshold: c.straight, targetAngle: c.target })
}

export default function PoseTest() {
  const [joint, setJoint] = useState<JointName>('knee')
  const counter = useRef(makeCounter('knee'))
  const samples = useRef<{ time: string; angle: number }[]>([])
  const startedAt = useRef(Date.now())
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [frame, setFrame] = useState<PoseFrame | null>(null)
  const [reps, setReps] = useState(0)
  const [lastMsg, setLastMsg] = useState('')
  const [result, setResult] = useState<TestSessionResult | null>(null)

  const reset = (j: JointName) => {
    counter.current = makeCounter(j)
    samples.current = []
    startedAt.current = Date.now()
    setReps(0); setLastMsg(''); setResult(null)
  }
  useEffect(() => reset(joint), [joint])

  const { videoRef, ready, error } = usePose(joint, (f) => {
    setFrame(f)
    drawOverlay(canvasRef.current, f, counter.current)
    if (f.angle == null) return
    samples.current.push({ time: new Date().toISOString(), angle: Math.round(f.angle * 10) / 10 })
    const ev = counter.current.update(f.angle, f.timeMs)
    if (ev.type === 'rep') {
      setReps(ev.count)
      setLastMsg(`Rep ${ev.count}: peak ${ev.peak.toFixed(0)}° ${ev.warnings.join(', ')}`)
    }
  })

  const finish = () => {
    const c = counter.current
    setResult({
      joint,
      reps_done: c.count,
      max_angle: Math.round(c.maxAngle * 10) / 10,
      form_warnings: [...new Set(c.warnings)],
      duration_sec: Math.round((Date.now() - startedAt.current) / 1000),
      angle_samples: samples.current,
    })
  }

  const cfg = JOINTS[joint]
  return (
    <div style={{ fontFamily: 'system-ui', padding: 16 }}>
      <h2>Pose test</h2>
      <label>
        Joint:{' '}
        <select value={joint} onChange={(e) => setJoint(e.target.value as JointName)}>
          {(Object.keys(JOINTS) as JointName[]).map((j) => (
            <option key={j} value={j}>{JOINTS[j].label}</option>
          ))}
        </select>
      </label>{' '}
      <button onClick={() => reset(joint)}>Reset</button>
      <p style={{ color: '#555' }}>{cfg.tip} · bent &gt; {cfg.bent}°, straight &lt; {cfg.straight}°, target {cfg.target}°</p>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {!ready && !error && <p>Loading model + camera…</p>}
      <div style={{ position: 'relative', width: W, height: H, transform: 'scaleX(-1)' }}>
        <video ref={videoRef} playsInline muted width={W} height={H} style={{ position: 'absolute' }} />
        <canvas ref={canvasRef} width={W} height={H} style={{ position: 'absolute' }} />
      </div>
      <p style={{ fontSize: 32 }}>
        {cfg.label}: {frame?.angle != null ? `${frame.angle.toFixed(0)}°` : 'not visible'} · Reps: {reps}
      </p>
      <p>Side: {frame?.side ?? '-'} · {lastMsg}</p>
      <button onClick={finish}>Finish session</button>
      {result && <pre>{JSON.stringify({ ...result, angle_samples: `${result.angle_samples.length} samples` }, null, 2)}</pre>}
    </div>
  )
}

function drawOverlay(canvas: HTMLCanvasElement | null, f: PoseFrame, c: RepCounter) {
  const ctx = canvas?.getContext('2d')
  if (!ctx || !canvas) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!f.points) return
  const pts = f.points.map((p) => [p.x * canvas.width, p.y * canvas.height] as const)
  ctx.strokeStyle = c.isBent ? '#f59e0b' : '#22c55e'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(...pts[0]); ctx.lineTo(...pts[1]); ctx.lineTo(...pts[2])
  ctx.stroke()
  ctx.fillStyle = '#fff'
  for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill() }
}
// Private pose test page: http://localhost:5173/pose-test.html
// Developer testbed for multi-joint angle calculation & rep counting.
import { useEffect, useRef, useState } from 'react'
import { usePose, type PoseFrame, type PreferredSide } from './usePose'
import { RepCounter } from './repCounter'
import { JOINTS, type JointName } from './joints'

interface TestSessionResult {
  joint: JointName
  side: PreferredSide
  reps_done: number
  max_angle: number
  form_warnings: string[]
  duration_sec: number
  angle_samples: { time: string; angle: number }[]
}

const W = 640,
  H = 480

function makeCounter(j: JointName) {
  const c = JOINTS[j]
  return new RepCounter({
    bentThreshold: c.bent,
    straightThreshold: c.straight,
    targetAngle: c.target,
    minValidMs: 450,
    minRepMs: 1200,
  })
}

export default function PoseTest() {
  const [joint, setJoint] = useState<JointName>('shoulder')
  const [sidePref, setSidePref] = useState<PreferredSide>('auto')
  const counter = useRef(makeCounter('shoulder'))
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
    setReps(0)
    setLastMsg('')
    setResult(null)
  }

  useEffect(() => {
    reset(joint)
  }, [joint, sidePref])

  const { videoRef, ready, error } = usePose({
    joint,
    preferredSide: sidePref,
    onFrame: (f) => {
      setFrame(f)
      drawOverlay(canvasRef.current, f, counter.current)
      if (f.angle == null) return
      samples.current.push({
        time: new Date().toISOString(),
        angle: Math.round(f.angle * 10) / 10,
      })
      const ev = counter.current.update(f.angle, f.timeMs)
      if (ev.type === 'rep') {
        setReps(ev.count)
        setLastMsg(`Rep ${ev.count}: peak ${ev.peak.toFixed(0)}° ${ev.warnings.join(', ')}`)
      }
    },
  })

  const finish = () => {
    const c = counter.current
    setResult({
      joint,
      side: sidePref,
      reps_done: c.count,
      max_angle: Math.round(c.maxAngle * 10) / 10,
      form_warnings: [...new Set(c.warnings)],
      duration_sec: Math.round((Date.now() - startedAt.current) / 1000),
      angle_samples: samples.current,
    })
  }

  const cfg = JOINTS[joint]
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 20, maxWidth: 800, margin: '0 auto' }}>
      <h2>RehabBuddy Pose Tracking Test</h2>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
        <label>
          <strong>Joint: </strong>
          <select value={joint} onChange={(e) => setJoint(e.target.value as JointName)}>
            {(Object.keys(JOINTS) as JointName[]).map((j) => (
              <option key={j} value={j}>
                {JOINTS[j].label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <strong>Side: </strong>
          <select value={sidePref} onChange={(e) => setSidePref(e.target.value as PreferredSide)}>
            <option value="auto">Auto (Sticky)</option>
            <option value="right">Right</option>
            <option value="left">Left</option>
          </select>
        </label>

        <button onClick={() => reset(joint)} style={{ padding: '4px 12px', cursor: 'pointer' }}>
          Reset
        </button>
      </div>

      <p style={{ color: '#555', fontSize: 14 }}>
        💡 {cfg.tip} · bent &gt; {cfg.bent}°, straight &lt; {cfg.straight}°, target {cfg.target}°
      </p>

      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {!ready && !error && <p style={{ color: '#0284c7' }}>Initializing MediaPipe PoseLandmarker & webcam…</p>}

      <div
        style={{
          position: 'relative',
          width: W,
          height: H,
          transform: 'scaleX(-1)',
          background: '#111',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <video ref={videoRef} playsInline muted width={W} height={H} style={{ position: 'absolute' }} />
        <canvas ref={canvasRef} width={W} height={H} style={{ position: 'absolute' }} />
      </div>

      <p style={{ fontSize: 28, margin: '16px 0 8px' }}>
        <strong>{cfg.label}:</strong> {frame?.angle != null ? `${frame.angle.toFixed(0)}°` : 'not visible'} ·{' '}
        <strong>Reps:</strong> {reps}
      </p>
      <p style={{ color: '#444' }}>
        Active Side: <strong>{frame?.side ?? '-'}</strong> {lastMsg ? `· ${lastMsg}` : ''}
      </p>

      <button
        onClick={finish}
        style={{
          marginTop: 12,
          padding: '8px 16px',
          background: '#0d9488',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontWeight: 'bold',
        }}
      >
        Finish session & View JSON
      </button>

      {result && (
        <pre
          style={{
            marginTop: 16,
            background: '#f4f4f5',
            padding: 12,
            borderRadius: 6,
            overflowX: 'auto',
          }}
        >
          {JSON.stringify(
            { ...result, angle_samples: `${result.angle_samples.length} samples collected` },
            null,
            2,
          )}
        </pre>
      )}
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
  ctx.moveTo(...pts[0])
  ctx.lineTo(...pts[1])
  ctx.lineTo(...pts[2])
  ctx.stroke()

  ctx.fillStyle = '#fff'
  for (const [x, y] of pts) {
    ctx.beginPath()
    ctx.arc(x, y, 7, 0, Math.PI * 2)
    ctx.fill()
  }
}
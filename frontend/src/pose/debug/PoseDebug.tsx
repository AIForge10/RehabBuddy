// Pose debugger: /pose-debug
// Shows what the tracker sees (every landmark, its visibility, which side it
// picked and why), charts the angle before and after filtering, and lets you
// tune the pipeline live. Record a clip (or load a video) to replay the same
// movement under different settings, then "Copy tuning" into tracker.ts.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { JOINTS, type FormFault, type JointName } from '../joints'
import { OFF_RATIO } from '../form'
import { RepCounter } from '../repCounter'
import { DEFAULT_TUNING, type PoseTuning, type PreferredSide, type SideInfo } from '../tracker'
import { usePose, type PoseFrame } from '../usePose'
import { Button, Panel, Segmented, Slider, Toggle } from './controls'
import { download, stamp } from './download'
import { COLORS, drawChart, drawOverlay, type ChartPoint } from './draw'
import { CaptureBar, ValidationResults } from './ValidationPanel'
import { HoldWindow, loadTrials, saveTrials, type HoldReading } from './validation'

const STORAGE_KEY = 'rb.poseDebug.v1'
const CHART_WINDOW_MS = 12_000
const EXPORT_WINDOW_MS = 60_000
const MAX_CLIP_MS = 60_000
const UI_EVERY_MS = 100

interface Settings {
  joint: JointName
  side: PreferredSide
  tuning: PoseTuning
  skeleton: boolean
  indices: boolean
  mirror: boolean
  show: { raw: boolean; world: boolean; legacy: boolean }
}

const DEFAULTS: Settings = {
  joint: 'knee',
  side: 'auto',
  tuning: DEFAULT_TUNING,
  skeleton: true,
  indices: false,
  mirror: true,
  show: { raw: true, world: true, legacy: true },
}

function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Settings> | null
    if (s) return { ...DEFAULTS, ...s, tuning: { ...DEFAULT_TUNING, ...s.tuning }, show: { ...DEFAULTS.show, ...s.show } }
  } catch {
    /* private mode or bad JSON: defaults */
  }
  return DEFAULTS
}

interface Snapshot {
  frame: PoseFrame
  fps: number
  inferenceMs: number
  jitterRaw: number | null
  jitterFinal: number | null
  reps: number
  bent: boolean
  lastRep: string | null
  faults: number
  hold: HoldReading
}

type FormLimit = 'thighMoveDeg' | 'leanBackDeg' | 'elbowDriftDeg' | 'shrugPct'

// Each joint's form check (form.ts): the tuning key for its threshold, and what that number is.
const FORM_CHECKS: Record<FormFault, { key: FormLimit; label: string; max: number; hint: string }> = {
  thigh_moving: { key: 'thighMoveDeg', label: 'Thigh turn', max: 60, hint: 'How far the thigh may turn from where it lay while the leg was straight.' },
  leaning_back: { key: 'leanBackDeg', label: 'Trunk lean back', max: 60, hint: 'How far the trunk may lean back past vertical. Leaning forward reads negative.' },
  elbow_drifting: { key: 'elbowDriftDeg', label: 'Upper arm off vertical', max: 60, hint: 'How far the upper arm may swing away from hanging straight down.' },
  shrugging: { key: 'shrugPct', label: 'Ear-to-shoulder gap closed', max: 80, hint: 'How far the shoulder may rise toward the ear, as a share of the gap it had with the arm down.' },
}

const JOINT_OPTIONS = (Object.keys(JOINTS) as JointName[]).map((j) => ({ value: j, label: JOINTS[j].label.replace(' (experimental)', '') }))
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const deg = (v: number | null | undefined, digits = 0) => (v == null ? '—' : `${v.toFixed(digits)}°`)

function stdDev(values: number[]) {
  if (values.length < 5) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
}

export default function PoseDebug() {
  const [settings, setSettings] = useState(loadSettings)
  const { joint, side, tuning } = settings
  const cfg = JOINTS[joint]
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings((s) => ({ ...s, [k]: v }))
  const tune = <K extends keyof PoseTuning>(k: K, v: PoseTuning[K]) => setSettings((s) => ({ ...s, tuning: { ...s.tuning, [k]: v } }))
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      /* not persisted: fine */
    }
  }, [settings])

  // ---- Video source: the camera, or a file / recorded clip on loop ----
  const [source, setSource] = useState<'camera' | 'file'>('camera')
  const [file, setFile] = useState<{ url: string; name: string } | null>(null)
  // State so effects and usePose re-run when the element mounts; the ref for imperative use.
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el
    setVideoEl(el)
  }, [])
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState('1')
  const [cameraOn, setCameraOn] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (source === 'camera') {
      let stopped = false
      video.loop = false
      navigator.mediaDevices
        .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
        .then((s) => {
          if (stopped) return s.getTracks().forEach((tr) => tr.stop())
          streamRef.current = s
          video.srcObject = s
          setSourceError(null)
          setCameraOn(true)
          return video.play()
        })
        .catch((e) => !stopped && setSourceError(`Camera: ${message(e)}`))
      return () => {
        stopped = true
        streamRef.current?.getTracks().forEach((tr) => tr.stop())
        streamRef.current = null
        video.srcObject = null
        setCameraOn(false)
      }
    }
    if (!file) return
    video.srcObject = null
    video.src = file.url
    video.loop = true
    fixRecordedDuration(video)
    void video.play().catch(() => {})
  }, [videoEl, source, file])

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = Number(rate)
  }, [videoEl, rate, file])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const sync = () => setPlaying(!video.paused)
    video.addEventListener('play', sync)
    video.addEventListener('pause', sync)
    return () => {
      video.removeEventListener('play', sync)
      video.removeEventListener('pause', sync)
    }
  }, [videoEl])

  const pickSource = (v: 'camera' | 'file') => {
    setSource(v)
    setSourceError(null)
  }
  const openFile = (f: File | undefined) => {
    if (!f) return
    setFile({ url: URL.createObjectURL(f), name: f.name })
    pickSource('file')
  }

  // ---- Recording a clip from the camera ----
  const recorderRef = useRef<MediaRecorder | null>(null)
  const [recordingSince, setRecordingSince] = useState<number | null>(null)
  const [clip, setClip] = useState<{ url: string; ext: string } | null>(null)
  const [now, setNow] = useState(0)

  const startRecording = () => {
    const stream = streamRef.current
    if (!stream) return
    const mime = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m))
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType })
      setClip({ url: URL.createObjectURL(blob), ext: rec.mimeType.includes('mp4') ? 'mp4' : 'webm' })
      setRecordingSince(null)
    }
    rec.start()
    recorderRef.current = rec
    setRecordingSince(Date.now())
  }
  const stopRecording = () => recorderRef.current?.state === 'recording' && recorderRef.current.stop()

  useEffect(() => {
    if (recordingSince == null) return
    const id = setInterval(() => {
      setNow(Date.now())
      if (Date.now() - recordingSince > MAX_CLIP_MS) recorderRef.current?.stop()
    }, 250)
    return () => clearInterval(id)
  }, [recordingSince])

  // Switching away from the camera ends a recording in progress.
  useEffect(() => {
    if (source !== 'camera' && recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }, [source])

  // ---- Per-frame pipeline output ----
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<HTMLCanvasElement>(null)
  const counter = useRef(new RepCounter({ bentThreshold: cfg.bent, straightThreshold: cfg.straight, restAngle: cfg.rest ?? 0, targetAngle: cfg.target }))
  const history = useRef<ChartPoint[]>([])
  const reps = useRef<{ t: number; count: number }[]>([])
  const log = useRef<object[]>([])
  const stats = useRef({ lastT: 0, fps: 0, inference: 0, lastUi: 0 })
  const settingsRef = useRef(settings)
  useEffect(() => {
    settingsRef.current = settings
  })
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const lastRep = useRef<string | null>(null)
  // Form faults this run, counted the way the live session counts them: once per appearance.
  const faults = useRef({ count: 0, on: false })
  // The last second of frames, for the validation capture.
  const hold = useRef(new HoldWindow())

  const resetRun = useCallback(() => {
    const c = JOINTS[joint]
    counter.current = new RepCounter({ bentThreshold: c.bent, straightThreshold: c.straight, restAngle: c.rest ?? 0, targetAngle: c.target })
    history.current = []
    reps.current = []
    log.current = []
    lastRep.current = null
    faults.current = { count: 0, on: false }
    hold.current.clear()
  }, [joint])
  useEffect(resetRun, [resetRun, side, source, file])

  const onFrame = (f: PoseFrame) => {
    const s = settingsRef.current
    const c = JOINTS[s.joint]
    const st = stats.current
    const t = f.timeMs

    const dt = t - st.lastT
    st.lastT = t
    if (dt > 0 && dt < 1000) st.fps = st.fps ? st.fps * 0.9 + (1000 / dt) * 0.1 : 1000 / dt
    st.inference = st.inference ? st.inference * 0.9 + f.inferenceMs * 0.1 : f.inferenceMs

    if (f.angle != null) {
      const ev = counter.current.update(f.angle, t)
      if (ev.type === 'rep') {
        reps.current.push({ t, count: ev.count })
        lastRep.current = `Rep ${ev.count}: peak ${ev.peak.toFixed(0)}°${ev.warnings.length ? ` · ${ev.warnings.join(', ')}` : ''}`
      }
    }

    hold.current.push(f)

    const faulty = f.form?.active ?? false
    if (faulty && !faults.current.on) faults.current.count += 1
    faults.current.on = faulty

    const h = history.current
    h.push({ t, angle: f.angle, raw: f.rawAngle, world: f.angle3d, legacy: f.legacyAngle })
    while (h.length && t - h[0].t > CHART_WINDOW_MS) h.shift()

    const l = log.current
    l.push({
      t: Math.round(t),
      side: f.side,
      held: f.held,
      angle: round(f.angle),
      raw: round(f.rawAngle),
      angle2d: round(f.angle2d),
      angle3d: round(f.angle3d),
      legacy: round(f.legacyAngle),
      reason: f.reason,
      form: f.form ? { fault: f.form.fault, value: round(f.form.value), active: f.form.active } : null,
      landmarks: f.landmarks?.map((p) => [round(p.x, 4), round(p.y, 4), round(p.z, 4), round(p.visibility, 3)]) ?? null,
    })
    while (l.length && t - (l[0] as { t: number }).t > EXPORT_WINDOW_MS) l.shift()

    drawOverlay(overlayRef.current, f, {
      skeleton: s.skeleton,
      indices: s.indices,
      mirror: s.mirror,
      minVisibility: s.tuning.minVisibility,
      bent: counter.current.isBent,
      cfg: c,
    })
    drawChart(chartRef.current, h, {
      now: t,
      windowMs: CHART_WINDOW_MS,
      cfg: c,
      target: c.target,
      show: s.show,
      reps: reps.current,
    })

    if (t - st.lastUi >= UI_EVERY_MS) {
      st.lastUi = t
      const recent = h.filter((p) => t - p.t <= 1000)
      setSnap({
        frame: f,
        fps: st.fps,
        inferenceMs: st.inference,
        jitterRaw: stdDev(recent.flatMap((p) => (p.raw == null ? [] : [p.raw]))),
        jitterFinal: stdDev(recent.flatMap((p) => (p.raw == null || p.angle == null ? [] : [p.angle]))),
        reps: counter.current.count,
        bent: counter.current.isBent,
        lastRep: lastRep.current,
        faults: faults.current.count,
        hold: hold.current.read(t),
      })
    }
  }

  const pose = usePose({ joint, preferredSide: side, externalVideo: videoEl, tuning, onFrame })

  // ---- Validation trials (kept apart from the settings, see validation.ts) ----
  const [trials, setTrials] = useState(loadTrials)
  useEffect(() => saveTrials(trials), [trials])
  const deleteTrial = (id: string) => setTrials((ts) => ts.filter((t) => t.id !== id))

  // ---- Actions ----
  const [copied, setCopied] = useState(false)
  const copyTuning = () => {
    const body = Object.entries(tuning)
      .map(([k, v]) => `  ${k}: ${typeof v === 'string' ? `'${v}'` : typeof v === 'number' ? Number(v.toFixed(3)) : v},`)
      .join('\n')
    void navigator.clipboard.writeText(`export const DEFAULT_TUNING: PoseTuning = {\n${body}\n}\n`).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  const exportFrames = () => {
    const f = snap?.frame
    const blob = new Blob(
      [JSON.stringify({ joint, side, tuning, video: f ? { width: f.videoWidth, height: f.videoHeight } : null, frames: log.current }, null, 1)],
      { type: 'application/json' },
    )
    download(URL.createObjectURL(blob), `pose-${joint}-${stamp()}.json`)
  }
  const togglePlay = () => {
    const video = videoRef.current
    if (video?.paused) void video.play()
    else video?.pause()
  }
  const step = (frames: number) => {
    const video = videoRef.current
    if (!video) return
    video.pause()
    video.currentTime = Math.max(0, video.currentTime + frames / 30)
  }

  const f = snap?.frame
  const tuned = JSON.stringify(tuning) !== JSON.stringify(DEFAULT_TUNING)
  const aspect = f ? `${f.videoWidth} / ${f.videoHeight}` : '16 / 9'
  const check = cfg.fault ? FORM_CHECKS[cfg.fault] : null
  const form = f?.form ?? null
  const status = sourceError ?? pose.error ?? (!pose.ready ? `Loading the ${tuning.model} model…` : source === 'file' && !file ? 'Load a video to start' : null)

  return (
    <div className="min-h-dvh bg-canvas pb-10">
      <header className="mx-auto flex max-w-[1440px] flex-wrap items-end justify-between gap-3 px-4 pt-6 sm:px-6">
        <div>
          <p className="label-mono text-brand-ink">Developer tool</p>
          <h1 className="mt-1 font-display text-3xl leading-none">Pose debugger</h1>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip>
            {tuning.model} · {pose.delegate ?? tuning.delegate}
            {pose.delegate && pose.delegate !== tuning.delegate && ' (fallback)'}
          </Chip>
          {pose.hand !== 'off' && <Chip>hand model {pose.hand === 'ready' ? (f?.source === 'hand' ? 'in use' : 'ready') : pose.hand}</Chip>}
          <Chip>{snap ? `${snap.fps.toFixed(0)} fps` : '— fps'}</Chip>
          <Chip>{snap ? `${snap.inferenceMs.toFixed(0)} ms / frame` : '— ms'}</Chip>
          <Chip>{f ? `${f.videoWidth}×${f.videoHeight}` : '—'}</Chip>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1440px] gap-4 px-4 pt-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Stage */}
          <div className="relative overflow-hidden rounded-3xl bg-stage ring-1 ring-line" style={{ aspectRatio: aspect }}>
            <div className="absolute inset-0" style={{ transform: settings.mirror ? 'scaleX(-1)' : undefined }}>
              <video ref={attachVideo} muted playsInline className="absolute inset-0 h-full w-full object-contain" />
              <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
            </div>

            <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-1.5 sm:left-4 sm:top-4">
              <div className="rounded-2xl bg-black/55 px-3.5 py-2 text-white backdrop-blur-md">
                <p className="label-mono text-[10px] text-white/60">
                  {cfg.label} · {f?.side ?? 'no side'}
                </p>
                <p className="text-4xl font-bold leading-tight tabular-nums tracking-tight">{deg(f?.angle)}</p>
              </div>
              {f?.held && <StageChip tone="warn">Holding last angle</StageChip>}
              {f?.swapped && <StageChip tone="warn">L/R swap followed</StageChip>}
              {f?.anchor === 'vertical' && <StageChip>Hip out of view: measuring from vertical</StageChip>}
              {form?.active && <StageChip tone="warn">Form fault: {form.fault.replace('_', ' ')}</StageChip>}
            </div>

            {source === 'camera' && recordingSince != null && (
              <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm font-semibold text-white sm:right-4 sm:top-4">
                <span className="size-2 animate-pulse rounded-full bg-red-500" />
                REC {((now - recordingSince) / 1000).toFixed(0)}s
              </div>
            )}

            {(status || (f && !f.landmarks)) && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
                <p className="rounded-full bg-black/65 px-4 py-2 text-center text-sm text-white backdrop-blur-md">{status ?? 'No person detected'}</p>
              </div>
            )}
            {!status && f?.landmarks && (
              <p className="pointer-events-none absolute bottom-3 left-3 max-w-[80%] rounded-xl bg-black/55 px-3 py-1.5 text-xs text-white/85 backdrop-blur-md sm:left-4">
                {f.reason}
              </p>
            )}
          </div>

          <CaptureBar
            hold={snap?.hold ?? null}
            read={() => hold.current.read(performance.now())}
            joint={joint}
            angleSource={tuning.angleSource}
            model={tuning.model}
            trials={trials}
            onAdd={(t) => setTrials((ts) => [...ts, t])}
            onDelete={deleteTrial}
          />

          {/* Readouts */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Readout label="Reps" value={snap ? String(snap.reps) : '—'} sub={snap ? (snap.bent ? 'In a rep (bent)' : 'Waiting for a bend') : cfg.tip} />
            <Readout label="Confidence" value={f ? f.confidence.toFixed(2) : '—'} sub="Lowest visibility of the 3 points" />
            <Readout
              label="Jitter, last 1 s"
              value={snap?.jitterFinal != null ? `±${deg(snap.jitterFinal, 1)}` : '—'}
              sub={snap?.jitterRaw != null ? `Unfiltered ±${deg(snap.jitterRaw, 1)}. Hold still to read.` : 'Std. deviation. Hold still to read.'}
            />
            <Readout
              label="Last rep"
              value={snap?.lastRep ? snap.lastRep.split(':')[0] : '—'}
              sub={snap?.lastRep ? snap.lastRep.split(': ')[1] : `Bent > ${cfg.bent}°, straight < ${cfg.straight}°`}
            />
          </div>

          {/* Chart */}
          <section className="rounded-3xl bg-stage p-4 text-white ring-1 ring-line">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h2 className="label-mono mr-auto text-white/60">Angle, last {CHART_WINDOW_MS / 1000} s</h2>
              <Legend color={COLORS.final} label="Final" value={deg(f?.angle)} />
              <Legend
                color={COLORS.raw}
                label={`Raw ${tuning.angleSource.toUpperCase()}`}
                value={deg(f?.rawAngle)}
                on={settings.show.raw}
                onToggle={() => set('show', { ...settings.show, raw: !settings.show.raw })}
              />
              <Legend
                color={COLORS.world}
                label="3D world"
                value={deg(f?.angle3d)}
                on={settings.show.world}
                onToggle={() => set('show', { ...settings.show, world: !settings.show.world })}
              />
              <Legend
                color={COLORS.legacy}
                label="Old math"
                value={deg(f?.legacyAngle)}
                dashed
                on={settings.show.legacy}
                onToggle={() => set('show', { ...settings.show, legacy: !settings.show.legacy })}
              />
            </div>
            <canvas ref={chartRef} className="mt-3 block h-56 w-full" />
            <p className="mt-2 text-xs text-white/50">
              Old math is the previous build's formula (normalized coordinates, no aspect correction) on the same points. The gap between it and Raw 2D is how far off it was.
            </p>
          </section>

          {/* Side inspector */}
          <Panel title="Side picking" action={<span className="text-xs text-muted">{side === 'auto' ? 'Auto' : `Locked ${side}`}</span>}>
            <div className="grid gap-2 sm:grid-cols-2">
              {(['left', 'right'] as const).map((name, i) => (
                <SideCard key={name} name={name} joint={cfg.label.replace(' (experimental)', '').toLowerCase()} info={f?.sides?.[i] ?? null} active={f?.side === name} />
              ))}
            </div>
            <p className="text-xs text-muted">
              Auto score = visibility + nearness to the camera (z) + movement over the last 2 s. Switching needs a {'>'}0.1 lead for {tuning.switchFrames} frames in a row.
            </p>
          </Panel>

          <ValidationResults trials={trials} onDelete={deleteTrial} onClear={() => setTrials([])} />
        </div>

        {/* Controls: on desktop they scroll on their own, so the stage and chart stay in view while you tune. */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:rounded-3xl">
          <Panel title="Source">
            <Segmented
              label="Video source"
              value={source}
              options={[
                { value: 'camera', label: 'Camera' },
                { value: 'file', label: file ? 'Video' : 'Video file' },
              ]}
              onChange={pickSource}
            />
            {source === 'camera' ? (
              <div className="flex flex-wrap gap-2">
                {recordingSince == null ? (
                  <Button onClick={startRecording} disabled={!cameraOn}>
                    <span className="size-2.5 rounded-full bg-red-500" /> Record clip
                  </Button>
                ) : (
                  <Button onClick={stopRecording} primary>
                    Stop recording
                  </Button>
                )}
                {clip && recordingSince == null && (
                  <Button
                    onClick={() => {
                      setFile({ url: clip.url, name: 'Recorded clip' })
                      pickSource('file')
                    }}
                  >
                    Replay clip
                  </Button>
                )}
              </div>
            ) : (
              <>
                {file && <p className="truncate text-sm text-ink-2">{file.name}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={togglePlay} disabled={!file} primary>
                    {playing ? 'Pause' : 'Play'}
                  </Button>
                  <Button onClick={() => step(-1)} disabled={!file}>
                    ‹ Frame
                  </Button>
                  <Button onClick={() => step(1)} disabled={!file}>
                    Frame ›
                  </Button>
                </div>
                <Segmented
                  label="Playback speed"
                  value={rate}
                  options={[
                    { value: '0.25', label: '¼×' },
                    { value: '0.5', label: '½×' },
                    { value: '1', label: '1×' },
                  ]}
                  onChange={setRate}
                />
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center rounded-xl bg-raised px-3.5 text-sm font-semibold text-ink ring-1 ring-line hover:bg-line">
                Load video…
                <input type="file" accept="video/*" className="sr-only" onChange={(e) => openFile(e.target.files?.[0])} />
              </label>
              {clip && (
                <Button onClick={() => download(clip.url, `pose-clip-${joint}-${stamp()}.${clip.ext}`)}>Save clip</Button>
              )}
            </div>
            <p className="text-xs text-muted">Record the movement that glitches, then replay it on loop while you change settings.</p>
          </Panel>

          <Panel title="Exercise">
            <label className="block text-sm font-medium text-ink-2">
              Joint
              <select
                value={joint}
                onChange={(e) => set('joint', e.target.value as JointName)}
                className="mt-1 block h-9 w-full rounded-xl bg-raised px-3 text-ink ring-1 ring-line"
              >
                {JOINT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <Segmented
              label="Side"
              value={side}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'left', label: 'Left' },
                { value: 'right', label: 'Right' },
              ]}
              onChange={(v) => set('side', v)}
            />
            <p className="text-xs text-muted">{cfg.tip}. Left/right are the person's own.</p>
            <Button onClick={resetRun}>Reset reps & chart</Button>
          </Panel>

          <Panel title="Model">
            <Segmented
              label="Model"
              value={tuning.model}
              options={[
                { value: 'lite', label: 'Lite' },
                { value: 'full', label: 'Full' },
                { value: 'heavy', label: 'Heavy' },
              ]}
              onChange={(v) => tune('model', v)}
            />
            <Segmented
              label="Delegate"
              value={tuning.delegate}
              options={[
                { value: 'GPU', label: 'GPU' },
                { value: 'CPU', label: 'CPU' },
              ]}
              onChange={(v) => tune('delegate', v)}
            />
            <Slider label="Detection confidence" value={tuning.minDetection} min={0.1} max={0.95} step={0.05} onChange={(v) => tune('minDetection', v)} format={(v) => v.toFixed(2)} />
            <Slider label="Presence confidence" value={tuning.minPresence} min={0.1} max={0.95} step={0.05} onChange={(v) => tune('minPresence', v)} format={(v) => v.toFixed(2)} />
            <Slider
              label="Tracking confidence"
              value={tuning.minTracking}
              min={0.1}
              max={0.95}
              step={0.05}
              onChange={(v) => tune('minTracking', v)}
              format={(v) => v.toFixed(2)}
              hint="Below this, MediaPipe re-detects the person instead of tracking the last frame."
            />
            {joint === 'wrist' && (
              <Toggle
                label="Hand model for the wrist"
                checked={tuning.handModel}
                onChange={(v) => tune('handModel', v)}
                hint="MediaPipe's 21-point hand model, measured wrist → middle knuckle. Off: the pose model's own hand points (index and pinky knuckles, averaged)."
              />
            )}
          </Panel>

          <Panel title="Measurement">
            <Segmented
              label="Angle source"
              value={tuning.angleSource}
              options={[
                { value: '2d', label: '2D image' },
                { value: '3d', label: '3D world' },
              ]}
              onChange={(v) => tune('angleSource', v)}
            />
            <Slider
              label="Min visibility"
              value={tuning.minVisibility}
              min={0.1}
              max={0.95}
              step={0.05}
              onChange={(v) => tune('minVisibility', v)}
              format={(v) => v.toFixed(2)}
              hint="Below this a point counts as unseen (hollow red on the overlay)."
            />
            <Slider label="Frames to switch side" value={tuning.switchFrames} min={1} max={30} step={1} onChange={(v) => tune('switchFrames', v)} />
            <Toggle label="Follow left/right label swaps" checked={tuning.followSwaps} onChange={(v) => tune('followSwaps', v)} />
          </Panel>

          <Panel title="Form check" action={form?.active ? <span className="label-mono text-[10px] text-critical">Fault</span> : null}>
            {check ? (
              <>
                <Toggle label="Check form" checked={tuning.formCheck} onChange={(v) => tune('formCheck', v)} />
                <div className="rounded-xl bg-raised p-3 ring-1 ring-line">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className={`text-2xl font-bold tabular-nums tracking-tight ${form?.active ? 'text-critical' : ''}`}>
                      {form?.value == null ? '—' : `${form.value.toFixed(0)}${form.unit}`}
                    </span>
                    <span className="text-xs text-muted">
                      {snap?.faults ?? 0} {snap?.faults === 1 ? 'fault' : 'faults'} this run
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{tuning.formCheck ? (form?.note ?? 'Waiting for a frame') : 'Off'}</p>
                </div>
                <Slider
                  label={check.label}
                  value={tuning[check.key]}
                  min={5}
                  max={check.max}
                  step={1}
                  onChange={(v) => tune(check.key, v)}
                  format={(v) => `${v}${cfg.fault === 'shrugging' ? '%' : '°'}`}
                  hint={check.hint}
                />
                {cfg.fault === 'shrugging' && (
                  <Slider
                    label="Judge shrugs below"
                    value={tuning.shrugMaxArm}
                    min={cfg.straight}
                    max={180}
                    step={5}
                    onChange={(v) => tune('shrugMaxArm', v)}
                    format={(v) => `${v}°`}
                    hint="Arm angle. Higher up, the shoulder rises by itself as the arm goes overhead."
                  />
                )}
                <Slider
                  label="Hold before it counts"
                  value={tuning.formHoldMs}
                  min={100}
                  max={2000}
                  step={50}
                  onChange={(v) => tune('formHoldMs', v)}
                  format={(v) => `${v} ms`}
                  hint={`And gone this long (under ${Math.round(tuning[check.key] * OFF_RATIO)}${cfg.fault === 'shrugging' ? '%' : '°'}) before it can count again. Only judged mid-rep.`}
                />
              </>
            ) : (
              <p className="text-xs text-muted">No form check for the {cfg.label.replace(' (experimental)', '').toLowerCase()}: its angle is still experimental.</p>
            )}
          </Panel>

          <Panel title="Smoothing">
            <Toggle
              label="Smooth landmarks"
              checked={tuning.smoothLandmarks}
              onChange={(v) => tune('smoothLandmarks', v)}
              hint="One Euro filter on every point before anything is measured or drawn."
            />
            <Slider
              label="Landmark min cutoff"
              value={tuning.lmMinCutoff}
              min={0.1}
              max={6}
              step={0.1}
              onChange={(v) => tune('lmMinCutoff', v)}
              format={(v) => `${v.toFixed(1)} Hz`}
            />
            <Slider
              label="Landmark beta"
              value={tuning.lmBeta}
              min={0}
              max={150}
              step={5}
              onChange={(v) => tune('lmBeta', v)}
              format={(v) => v.toFixed(0)}
              hint="Per frame-diagonal/s of movement. Higher = less lag while moving, more jitter."
            />
            <Toggle label="Median of 3 (drops one-frame spikes)" checked={tuning.median} onChange={(v) => tune('median', v)} />
            <Slider
              label="Min cutoff"
              value={tuning.minCutoff}
              min={0.1}
              max={6}
              step={0.1}
              onChange={(v) => tune('minCutoff', v)}
              format={(v) => `${v.toFixed(1)} Hz`}
              hint="Lower = steadier when still, but slower to settle."
            />
            <Slider
              label="Beta"
              value={tuning.beta}
              min={0}
              max={0.2}
              step={0.005}
              onChange={(v) => tune('beta', v)}
              format={(v) => v.toFixed(3)}
              hint="Higher = less lag while moving, more jitter."
            />
            <Slider
              label="Hold through dropouts"
              value={tuning.holdMs}
              min={0}
              max={1500}
              step={50}
              onChange={(v) => tune('holdMs', v)}
              format={(v) => `${v} ms`}
            />
          </Panel>

          <Panel title="View">
            <Toggle label="Full skeleton" checked={settings.skeleton} onChange={(v) => set('skeleton', v)} />
            <Toggle label="Landmark numbers" checked={settings.indices} onChange={(v) => set('indices', v)} />
            <Toggle label="Mirror" checked={settings.mirror} onChange={(v) => set('mirror', v)} />
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: COLORS.left }} /> Left
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: COLORS.right }} /> Right
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ boxShadow: `inset 0 0 0 2px ${COLORS.lowVis}` }} /> Unseen
              </span>
            </div>
          </Panel>

          <Panel title="Tuning" action={tuned ? <span className="label-mono text-[10px] text-warn">Changed</span> : null}>
            <div className="flex flex-wrap gap-2">
              <Button onClick={copyTuning} primary>
                {copied ? 'Copied' : 'Copy tuning'}
              </Button>
              <Button onClick={() => set('tuning', DEFAULT_TUNING)} disabled={!tuned}>
                Reset
              </Button>
              <Button onClick={exportFrames} disabled={!f}>
                Export frames
              </Button>
            </div>
            <p className="text-xs text-muted">
              Copy tuning puts a DEFAULT_TUNING block on your clipboard for <code className="font-mono">src/pose/tracker.ts</code>. Export frames saves the last 60 s of landmarks and angles as JSON.
            </p>
          </Panel>
        </aside>
      </main>
    </div>
  )
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="label-mono rounded-full bg-surface px-2.5 py-1.5 text-[10px] text-ink-2 ring-1 ring-line">{children}</span>
}

function StageChip({ children, tone }: { children: ReactNode; tone?: 'warn' }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold backdrop-blur-md ${tone === 'warn' ? 'bg-amber-400/90 text-black' : 'bg-black/55 text-white'}`}>
      {children}
    </span>
  )
}

function Readout({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-surface p-3 shadow-card ring-1 ring-line">
      <p className="label-mono text-[10px] text-muted">{label}</p>
      <p className="mt-1 truncate text-2xl font-bold tabular-nums tracking-tight">{value}</p>
      <p className="mt-0.5 line-clamp-2 text-xs text-muted">{sub}</p>
    </div>
  )
}

function Legend({
  color,
  label,
  value,
  dashed = false,
  on = true,
  onToggle,
}: {
  color: string
  label: string
  value: string
  dashed?: boolean
  on?: boolean
  onToggle?: () => void
}) {
  const body = (
    <>
      <span className="inline-block h-0 w-4 border-t-2" style={{ borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }} />
      <span className="text-white/70">{label}</span>
      <span className="w-10 font-mono tabular-nums text-white">{value}</span>
    </>
  )
  const cls = `flex items-center gap-1.5 text-xs transition-opacity ${on ? '' : 'opacity-35'}`
  return onToggle ? (
    <button type="button" aria-pressed={on} onClick={onToggle} className={cls}>
      {body}
    </button>
  ) : (
    <span className={cls}>{body}</span>
  )
}

function SideCard({ name, joint, info, active }: { name: 'left' | 'right'; joint: string; info: SideInfo | null; active: boolean }) {
  return (
    <div className={`rounded-2xl p-3 ring-1 transition-colors ${active ? 'bg-brand-soft ring-brand' : 'bg-raised ring-line'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold capitalize">
          <span className="size-2.5 rounded-full" style={{ background: COLORS[name] }} />
          {name} {joint}
        </p>
        {active && <span className="label-mono rounded-full bg-brand px-2 py-0.5 text-[10px] text-on-brand">Tracking</span>}
        {info && !info.visible && <span className="label-mono text-[10px] text-critical">Unseen</span>}
      </div>
      <dl className="mt-2.5 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted">Visibility</dt>
        <dd className="flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <span className="block h-full rounded-full bg-brand" style={{ width: `${(info?.visibility ?? 0) * 100}%` }} />
          </span>
          <span className="w-9 text-right font-mono text-xs tabular-nums">{info ? info.visibility.toFixed(2) : '—'}</span>
        </dd>
        <dt className="text-muted">Depth z</dt>
        <dd className="text-right font-mono text-xs tabular-nums">{info ? info.depth.toFixed(2) : '—'}</dd>
        <dt className="text-muted">Motion, 2 s</dt>
        <dd className="text-right font-mono text-xs tabular-nums">{info ? `${info.motion.toFixed(0)}°` : '—'}</dd>
        <dt className="text-muted">Angle 2D / 3D</dt>
        <dd className="text-right font-mono text-xs tabular-nums">
          {info ? `${info.angle2d.toFixed(0)}° / ${info.angle3d?.toFixed(0) ?? '—'}°` : '—'}
        </dd>
        <dt className="font-semibold text-ink-2">Score</dt>
        <dd className="text-right font-mono text-xs font-semibold tabular-nums">{info ? info.score.toFixed(2) : '—'}</dd>
      </dl>
    </div>
  )
}

function round(v: number | null | undefined, digits = 1) {
  if (v == null) return null
  const k = 10 ** digits
  return Math.round(v * k) / k
}

// MediaRecorder's WebM has no duration, so the clip can't seek or loop cleanly
// until the browser has scanned to the end once.
function fixRecordedDuration(video: HTMLVideoElement) {
  const onMeta = () => {
    if (video.duration !== Infinity) return
    const back = () => {
      video.removeEventListener('durationchange', back)
      video.currentTime = 0
    }
    video.addEventListener('durationchange', back)
    video.currentTime = 1e101
  }
  video.addEventListener('loadedmetadata', onMeta, { once: true })
}

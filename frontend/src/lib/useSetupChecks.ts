import { useEffect, useRef, useState, type RefObject } from 'react'
import type { JointName } from '../pose/joints'
import { detect, loadLandmarker, type LoadedLandmarker } from '../pose/landmarker'
import { DEFAULT_TUNING } from '../pose/tracker'
import {
  BODY,
  measureLight,
  readFraming,
  readLight,
  readPlacement,
  seen,
  settled,
  speed,
  STEADY_MS,
  type Framing,
  type FramingRead,
  type LightReading,
  type Mark,
  type Placement,
  type Sample,
} from './setupChecks'

// Runs the setup checks (setupChecks.ts) on the setup preview. It borrows the
// app's one pose landmarker, the one the live session uses next, and works at a
// fraction of the frame rate: setup only needs to know whether someone is in place.

const POSE_MS = 100
const LIGHT_MS = 250
const THUMB_W = 128
// Auto-exposure takes a moment to settle when the camera starts; don't call the room dark while it does.
const WARMUP_MS = 1500
// Faster than this (frame diagonals a second) is someone walking into place, not sitting in it.
const STILL = 0.1

export interface SetupReadings {
  placement: Placement | null
  framing: Framing | null
  light: LightReading | null
}

export interface SetupChecks extends SetupReadings {
  /**
   * Placement, framing and light: whether the camera has seen each one pass for
   * a steady second. A pass sticks for the rest of setup, because the patient
   * walks up to the screen to press Start and the list shouldn't untick itself
   * behind them. The live session says if the limb goes missing after that.
   */
  passed: readonly [boolean, boolean, boolean]
  /** Overlay for the tracked joints: give it the video's size and object-fit, and mirror it with the video. */
  canvasRef: RefObject<HTMLCanvasElement | null>
}

const NONE: SetupReadings = { placement: null, framing: null, light: null }
const NOT_YET = [false, false, false] as const
const isOk = (r: SetupReadings) => [r.placement === 'ok', r.framing?.status === 'ok', r.light === 'ok'] as const

/** `video` is the playing preview, or null while there's no camera (nothing runs then). */
export function useSetupChecks(video: HTMLVideoElement | null, part: JointName): SetupChecks {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Keyed by joint, so a different exercise never inherits the last one's ticks.
  const [state, setState] = useState({ part, readings: NONE, passed: NOT_YET as readonly [boolean, boolean, boolean] })

  useEffect(() => {
    if (!video) return
    let cancelled = false
    let tracker: LoadedLandmarker | null = null
    // Preloaded by ExerciseSession, so usually ready. Without it the light check still runs.
    loadLandmarker(DEFAULT_TUNING.model, DEFAULT_TUNING.delegate).then(
      (l) => {
        if (!cancelled) tracker = l
      },
      () => {},
    )

    const thumb = document.createElement('canvas')
    const thumbCtx = thumb.getContext('2d', { willReadFrequently: true })
    const color = getComputedStyle(document.documentElement).getPropertyValue('--rb-brand-glow').trim() || '#4baea7'

    const samples = {
      placement: [] as Sample<Placement | null | undefined>[],
      framing: [] as Sample<Framing | undefined>[],
      light: [] as Sample<LightReading | null>[],
    }
    const push = <T>(list: Sample<T>[], t: number, value: T) => {
      list.push({ t, value })
      while (list.length && t - list[0].t > STEADY_MS) list.shift()
    }

    let shown = NONE
    let lm: Mark[] | null = null
    let prev: { lm: Mark[]; t: number } | null = null
    let startedAt = 0
    let lastFrame = -1
    let nextPose = 0
    let nextLight = 0
    let raf = 0
    let drawnOn: HTMLCanvasElement | null = null

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (video.readyState < 2 || !video.videoWidth) return
      const w = video.videoWidth
      const h = video.videoHeight
      startedAt ||= now
      let fresh = false

      if (tracker && now >= nextPose && video.currentTime !== lastFrame) {
        lastFrame = video.currentTime
        const t0 = performance.now()
        let ran = true
        try {
          lm = detect(tracker.landmarker, video).landmarks[0] ?? null
          // On a slow (CPU-only) machine, keep tracking to a quarter of the main thread at most.
          nextPose = now + Math.max(POSE_MS, 4 * (performance.now() - t0))
        } catch {
          // A failed frame says nothing about the room (not even "nobody there"): record nothing, try again shortly.
          lm = null
          prev = null
          nextPose = now + 1000
          ran = false
        }
        if (ran) {
          const read = readFraming(lm, part)
          drawnOn = canvasRef.current
          draw(drawnOn, w, h, read, color)
          // Someone crossing the room isn't in place yet: while they move, the pose
          // checks record nothing, so walking past the camera can't tick them.
          const v = lm && prev ? speed(prev.lm, lm, w, h, now - prev.t) : null
          const moving = v != null && v > STILL
          prev = lm ? { lm, t: now } : null
          push(samples.framing, now, moving ? undefined : read.framing)
          push(samples.placement, now, moving ? undefined : readPlacement(lm, w, h))
          fresh = true
        }
      }

      if (thumbCtx && now >= nextLight && now - startedAt >= WARMUP_MS) {
        nextLight = now + LIGHT_MS
        const tw = THUMB_W
        const th = Math.max(1, Math.round((THUMB_W * h) / w))
        if (thumb.width !== tw || thumb.height !== th) {
          thumb.width = tw
          thumb.height = th
        }
        thumbCtx.drawImage(video, 0, 0, tw, th)
        const person = lm
        const body = person ? BODY.map((i) => person[i]).filter(seen) : []
        push(samples.light, now, readLight(measureLight(thumbCtx.getImageData(0, 0, tw, th).data, tw, th, body)))
        fresh = true
      }
      if (!fresh) return

      // Show a reading once it has settled; while readings are mixed, keep the last one.
      const next: SetupReadings = {
        placement: pick(settled(samples.placement, now), shown.placement),
        framing: pick(settled(samples.framing, now), shown.framing),
        light: pick(settled(samples.light, now), shown.light),
      }
      if (JSON.stringify(next) === JSON.stringify(shown)) return
      shown = next
      const ok = isOk(next)
      setState((s) => ({
        part,
        readings: next,
        passed: s.part === part ? [s.passed[0] || ok[0], s.passed[1] || ok[1], s.passed[2] || ok[2]] : ok,
      }))
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      drawnOn?.getContext('2d')?.clearRect(0, 0, drawnOn.width, drawnOn.height)
    }
  }, [video, part])

  const current = state.part === part ? state : { readings: NONE, passed: NOT_YET }
  return { ...current.readings, passed: current.passed, canvasRef }
}

/** A settled reading, or the one already shown while there's none. */
const pick = <T>(settledValue: T | null | undefined, shown: T | null): T | null => (settledValue === undefined ? shown : settledValue)

/** The measured joints as the camera sees them: solid where seen, faint where it's guessing. */
function draw(canvas: HTMLCanvasElement | null, w: number, h: number, { points, seen: ok }: FramingRead, color: string) {
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  ctx.clearRect(0, 0, w, h)
  if (!points) return
  const scale = w / 640
  const px = points.map((p) => [p.x * w, p.y * h] as const)
  ctx.lineCap = 'round'
  ctx.strokeStyle = color
  ctx.lineWidth = 5 * scale
  for (let i = 0; i < 2; i++) {
    ctx.globalAlpha = ok[i] && ok[i + 1] ? 0.9 : 0.3
    ctx.beginPath()
    ctx.moveTo(...px[i])
    ctx.lineTo(...px[i + 1])
    ctx.stroke()
  }
  ctx.lineWidth = 3 * scale
  ctx.fillStyle = '#ffffff'
  px.forEach((p, i) => {
    ctx.globalAlpha = ok[i] ? 1 : 0.4
    ctx.beginPath()
    ctx.arc(...p, 7 * scale, 0, Math.PI * 2)
    if (ok[i]) ctx.fill()
    ctx.strokeStyle = ok[i] ? color : '#ffffff'
    ctx.stroke()
  })
  ctx.globalAlpha = 1
}

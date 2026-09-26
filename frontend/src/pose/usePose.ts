// webcam + MediaPipe Pose Landmarker hook, works for any joint in joints.ts.
// This hook owns the frame loop (and the camera, unless you pass externalVideo);
// the landmarks → angle pipeline lives in tracker.ts.
import { useEffect, useRef, useState } from 'react'
import { detect, loadLandmarker, setThresholds, type LoadedLandmarker } from './landmarker'
import { DEFAULT_TUNING, JointTracker, type PoseTuning, type PreferredSide, type TrackFrame } from './tracker'
import type { JointName } from './joints'

export type { PreferredSide }

export interface PoseFrame extends TrackFrame {
  /** How long MediaPipe took on this frame. */
  inferenceMs: number
  videoWidth: number
  videoHeight: number
}

export interface UsePoseOptions {
  joint: JointName
  preferredSide?: PreferredSide
  externalVideo?: HTMLVideoElement | null
  tuning?: Partial<PoseTuning>
  onFrame?: (f: PoseFrame) => void
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function usePose(opts: UsePoseOptions) {
  const { joint, preferredSide = 'auto', externalVideo, onFrame } = opts
  const tuning: PoseTuning = { ...DEFAULT_TUNING, ...opts.tuning }
  const { model, delegate, minDetection, minPresence, minTracking } = tuning
  const tuningKey = JSON.stringify(tuning)

  const internalVideoRef = useRef<HTMLVideoElement>(null)
  const [loaded, setLoaded] = useState<{ key: string; value: LoadedLandmarker } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tracker] = useState(() => new JointTracker(joint, preferredSide, tuning))

  const onFrameRef = useRef(onFrame)
  useEffect(() => {
    onFrameRef.current = onFrame
  })
  useEffect(() => tracker.configure(joint, preferredSide), [tracker, joint, preferredSide])
  useEffect(() => tracker.setTuning(JSON.parse(tuningKey)), [tracker, tuningKey])

  // Only a landmarker for the model/delegate asked for right now; while a new one
  // loads, the old one is being closed and must not be fed frames.
  const modelKey = `${model}/${delegate}`
  const active = loaded?.key === modelKey ? loaded.value : null

  useEffect(() => {
    let cancelled = false
    loadLandmarker(model, delegate).then(
      (value) => !cancelled && setLoaded({ key: `${model}/${delegate}`, value }),
      (e) => !cancelled && setError(message(e)),
    )
    return () => {
      cancelled = true
    }
  }, [model, delegate])

  useEffect(() => {
    if (active) setThresholds(active, { minDetection, minPresence, minTracking })
  }, [active, minDetection, minPresence, minTracking])

  // Own camera, only when the caller doesn't bring a video.
  useEffect(() => {
    if (externalVideo) return
    const video = internalVideoRef.current
    if (!video) return
    let stream: MediaStream | null = null
    let stopped = false
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((tr) => tr.stop())
        stream = s
        video.srcObject = s
        return video.play()
      })
      .catch((e) => !stopped && setError(message(e)))
    return () => {
      stopped = true
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [externalVideo])

  useEffect(() => {
    const video = externalVideo ?? internalVideoRef.current
    if (!active || !video) return
    let raf = 0
    let lastTime = -1
    let failing = false
    const tick = () => {
      raf = requestAnimationFrame(tick)
      // One detection per new video frame (the display refreshes faster than the camera).
      if (video.readyState < 2 || !video.videoWidth || video.currentTime === lastTime) return
      lastTime = video.currentTime
      const t0 = performance.now()
      let res
      try {
        res = detect(active.landmarker, video)
      } catch (e) {
        if (!failing) setError(message(e))
        failing = true
        return
      }
      if (failing) setError(null)
      failing = false
      const inferenceMs = performance.now() - t0
      const f = tracker.process(res, video.videoWidth, video.videoHeight, t0)
      onFrameRef.current?.({ ...f, inferenceMs, videoWidth: video.videoWidth, videoHeight: video.videoHeight })
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, externalVideo, tracker])

  return {
    videoRef: internalVideoRef,
    ready: active != null,
    error,
    /** What actually loaded (GPU can fall back to CPU). */
    delegate: active?.delegate ?? null,
    reset: () => tracker.reset(),
  }
}

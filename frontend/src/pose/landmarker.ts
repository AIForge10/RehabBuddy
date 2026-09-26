// One PoseLandmarker for the whole app. Loading a model takes seconds and each
// instance holds its own WebGL context, so screens share one instead of making
// (and leaking) a new one on every mount. Asking for a different model/delegate
// closes the old instance first.
import { FilesetResolver, PoseLandmarker, type PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import { bundledPose } from '../lib/native'

// The mobile app ships the runtime and its model inside the app; the web fetches them.
const WASM_URL = bundledPose?.wasm ?? 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const modelUrl = (m: PoseModel) =>
  bundledPose?.models[m] ??
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${m}/float16/latest/pose_landmarker_${m}.task`

// lite ≈ 5 MB, fastest, noticeably jumpier. full ≈ 9 MB, the accuracy/speed sweet spot.
// heavy ≈ 30 MB, most accurate, too slow for older phones.
export type PoseModel = 'lite' | 'full' | 'heavy'
export type PoseDelegate = 'GPU' | 'CPU'

export interface Thresholds {
  minDetection: number
  minPresence: number
  minTracking: number
}

export interface LoadedLandmarker {
  landmarker: PoseLandmarker
  model: PoseModel
  /** What actually loaded: GPU falls back to CPU when WebGL isn't available. */
  delegate: PoseDelegate
  thresholds: Thresholds
}

// MediaPipe's own defaults, which DEFAULT_TUNING keeps.
const INITIAL: Thresholds = { minDetection: 0.5, minPresence: 0.5, minTracking: 0.5 }

let fileset: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null
let current: { key: string; promise: Promise<LoadedLandmarker> } | null = null

export function loadLandmarker(model: PoseModel = 'full', delegate: PoseDelegate = 'GPU'): Promise<LoadedLandmarker> {
  const key = `${model}/${delegate}`
  if (current?.key === key) return current.promise

  const previous = current?.promise
  const promise = (async () => {
    await previous?.then((p) => p.landmarker.close()).catch(() => {})
    fileset ??= FilesetResolver.forVisionTasks(WASM_URL)
    const vision = await fileset
    const create = (d: PoseDelegate) =>
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelUrl(model), delegate: d },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: INITIAL.minDetection,
        minPosePresenceConfidence: INITIAL.minPresence,
        minTrackingConfidence: INITIAL.minTracking,
      })
    try {
      return { landmarker: await create(delegate), model, delegate, thresholds: INITIAL }
    } catch (e) {
      if (delegate === 'CPU') throw e
      return { landmarker: await create('CPU'), model, delegate: 'CPU' as const, thresholds: INITIAL }
    }
  })()
  current = { key, promise }
  // A failed load shouldn't stick: the next caller retries.
  promise.catch(() => {
    if (current?.promise === promise) current = null
  })
  return promise
}

/** setOptions rebuilds MediaPipe's whole graph (and WebGL context), so only call it on a real change. */
export function setThresholds(loaded: LoadedLandmarker, t: Thresholds) {
  const c = loaded.thresholds
  if (c.minDetection === t.minDetection && c.minPresence === t.minPresence && c.minTracking === t.minTracking) return
  loaded.thresholds = { ...t }
  void loaded.landmarker
    .setOptions({ minPoseDetectionConfidence: t.minDetection, minPosePresenceConfidence: t.minPresence, minTrackingConfidence: t.minTracking })
    .catch(() => {})
}

/** Start the download early (e.g. on the setup screen) so tracking is ready when the session starts. */
export function preloadPose() {
  void loadLandmarker().catch(() => {})
}

// VIDEO mode rejects a timestamp that isn't strictly greater than the last one
// it saw, and the shared instance can outlive the screen that fed it.
let lastTs = 0
export function detect(landmarker: PoseLandmarker, video: HTMLVideoElement): PoseLandmarkerResult {
  lastTs = Math.max(performance.now(), lastTs + 1)
  return landmarker.detectForVideo(video, lastTs)
}

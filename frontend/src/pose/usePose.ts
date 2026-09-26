// Satyabrata — webcam + MediaPipe Pose Landmarker hook, works for any joint in joints.ts.
import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import { jointAngle, Smoother } from './angle'
import { JOINTS, type JointConfig, type JointName } from './joints'

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'
const MIN_VISIBILITY = 0.5

export interface PoseFrame {
  angle: number | null            // smoothed angle, null if the joint isn't visible
  side: 'left' | 'right' | null
  points: NormalizedLandmark[] | null  // [a, joint, b] for drawing
  timeMs: number
}

function pickSide(lm: NormalizedLandmark[], cfg: JointConfig): 0 | 1 | null {
  const vis = (i: 0 | 1) => Math.min(lm[cfg.a[i]].visibility, lm[cfg.joint[i]].visibility, lm[cfg.b[i]].visibility)
  const l = vis(0), r = vis(1)
  if (Math.max(l, r) < MIN_VISIBILITY) return null
  return l >= r ? 0 : 1
}

export function usePose(jointName: JointName, onFrame?: (f: PoseFrame) => void) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame
  const jointRef = useRef(jointName)
  const smootherRef = useRef(new Smoother(5))

  // Switching joint: reset smoothing, keep camera + model running.
  useEffect(() => {
    jointRef.current = jointName
    smootherRef.current = new Smoother(5)
  }, [jointName])

  useEffect(() => {
    let landmarker: PoseLandmarker | null = null
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false

    async function start() {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL)
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
        })
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
        const video = videoRef.current
        if (!video || stopped) return
        video.srcObject = stream
        await video.play()
        setReady(true)

        let lastVideoTime = -1
        const loop = () => {
          if (stopped || !landmarker) return
          if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime
            const now = performance.now()
            const res = landmarker.detectForVideo(video, now)
            const lm = res.landmarks[0] ?? null
            const cfg = JOINTS[jointRef.current]
            let angle: number | null = null
            let side: PoseFrame['side'] = null
            let points: NormalizedLandmark[] | null = null
            if (lm) {
              const s = pickSide(lm, cfg)
              if (s !== null) {
                const a = lm[cfg.a[s]], j = lm[cfg.joint[s]], b = lm[cfg.b[s]]
                side = s === 0 ? 'left' : 'right'
                points = [a, j, b]
                angle = smootherRef.current.push(jointAngle(cfg, a, j, b))
              }
            }
            onFrameRef.current?.({ angle, side, points, timeMs: now })
          }
          raf = requestAnimationFrame(loop)
        }
        loop()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    }
    start()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      landmarker?.close()
    }
  }, [])

  return { videoRef, ready, error }
}

// webcam + MediaPipe Pose Landmarker hook, works for any joint in joints.ts.
import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import { jointAngle, Smoother } from './angle'
import { JOINTS, type JointConfig, type JointName } from './joints'

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'
const MIN_VISIBILITY = 0.5

export type PreferredSide = 'auto' | 'left' | 'right'

export interface PoseFrame {
  angle: number | null                 // smoothed angle, null if the joint isn't visible
  side: 'left' | 'right' | null
  points: NormalizedLandmark[] | null  // [a, joint, b] for drawing
  timeMs: number
  confidence: number
}

export interface UsePoseOptions {
  joint: JointName
  preferredSide?: PreferredSide
  externalVideo?: HTMLVideoElement | null
  onFrame?: (f: PoseFrame) => void
}

function pickSide(
  lm: NormalizedLandmark[],
  cfg: JointConfig,
  currentSide: 0 | 1 | null,
  preferred: PreferredSide,
): 0 | 1 | null {
  if (preferred === 'left') {
    const vis = Math.min(lm[cfg.joint[0]]?.visibility ?? 1, lm[cfg.b[0]]?.visibility ?? 1)
    return vis >= 0.35 ? 0 : null
  }
  if (preferred === 'right') {
    const vis = Math.min(lm[cfg.joint[1]]?.visibility ?? 1, lm[cfg.b[1]]?.visibility ?? 1)
    return vis >= 0.35 ? 1 : null
  }

  // Auto mode: evaluate limb visibility (joint and distal point)
  const vis = (i: 0 | 1) =>
    Math.min(lm[cfg.joint[i]]?.visibility ?? 1, lm[cfg.b[i]]?.visibility ?? 1)
  const l = vis(0),
    r = vis(1)

  if (Math.max(l, r) < MIN_VISIBILITY) return null

  // Sticky hysteresis: if already tracking a side and it's still clearly in frame,
  // do NOT swap back and forth between frames due to tiny visibility noise.
  if (currentSide === 0 && l >= 0.4) return 0
  if (currentSide === 1 && r >= 0.4) return 1

  return l >= r ? 0 : 1
}

function getJointPoints(
  lm: NormalizedLandmark[],
  cfg: JointConfig,
  side: 0 | 1,
  jointName: JointName,
): [NormalizedLandmark, NormalizedLandmark, NormalizedLandmark] {
  const j = lm[cfg.joint[side]]
  const b = lm[cfg.b[side]]
  const hip = lm[cfg.a[side]]

  if (jointName === 'shoulder') {
    // When sitting at a desk or when camera cuts off the waist, hips are occluded or jitter.
    // In that case, anchor the torso line straight down from the shoulder.
    const hipVis = hip?.visibility ?? 1
    const hipY = hip?.y ?? 1.5
    if (hipY > 0.92 || hipVis < 0.4) {
      const torsoDown: NormalizedLandmark = {
        x: j.x,
        y: j.y + 0.4,
        z: j.z,
        visibility: 1.0,
      }
      return [torsoDown, j, b]
    }
  }

  return [hip, j, b]
}

export function usePose(
  jointOrOptions: JointName | UsePoseOptions,
  legacyOnFrame?: (f: PoseFrame) => void,
) {
  const opts: UsePoseOptions =
    typeof jointOrOptions === 'string'
      ? { joint: jointOrOptions, onFrame: legacyOnFrame }
      : jointOrOptions

  const { joint, preferredSide = 'auto', externalVideo, onFrame } = opts
  const internalVideoRef = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame
  const jointRef = useRef(joint)
  jointRef.current = joint
  const sidePrefRef = useRef(preferredSide)
  sidePrefRef.current = preferredSide
  const activeSideRef = useRef<0 | 1 | null>(null)
  const smootherRef = useRef(new Smoother(5))

  // Switching joint: reset smoothing & active side
  useEffect(() => {
    jointRef.current = joint
    smootherRef.current.reset()
    activeSideRef.current = null
  }, [joint])

  // Switching preferred side: reset smoothing
  useEffect(() => {
    sidePrefRef.current = preferredSide
    smootherRef.current.reset()
    activeSideRef.current = null
  }, [preferredSide])

  useEffect(() => {
    let landmarker: PoseLandmarker | null = null
    let internalStream: MediaStream | null = null
    let raf = 0
    let stopped = false

    async function start() {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL)
        const commonConfig = {
          runningMode: 'VIDEO' as const,
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        }

        try {
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
            ...commonConfig,
          })
        } catch {
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
            ...commonConfig,
          })
        }

        const video = externalVideo ?? internalVideoRef.current
        if (!video) return

        if (!externalVideo) {
          internalStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 },
          })
          if (stopped) return
          video.srcObject = internalStream
          await video.play()
        }

        setReady(true)

        let lastVideoTime = -1
        const loop = () => {
          if (stopped || !landmarker) return

          const currentVid = externalVideo ?? internalVideoRef.current
          if (currentVid && currentVid.readyState >= 2 && currentVid.currentTime !== lastVideoTime) {
            lastVideoTime = currentVid.currentTime
            const now = performance.now()
            const res = landmarker.detectForVideo(currentVid, now)
            const lm = res.landmarks[0] ?? null
            const cfg = JOINTS[jointRef.current]

            let angle: number | null = null
            let side: PoseFrame['side'] = null
            let points: NormalizedLandmark[] | null = null
            let confidence = 0

            if (lm) {
              const s = pickSide(lm, cfg, activeSideRef.current, sidePrefRef.current)
              if (s !== null) {
                if (activeSideRef.current !== s) {
                  activeSideRef.current = s
                  smootherRef.current.reset()
                }
                const [a, j, b] = getJointPoints(lm, cfg, s, jointRef.current)
                side = s === 0 ? 'left' : 'right'
                points = [a, j, b]
                confidence = Math.min(
                  j?.visibility ?? 1,
                  b?.visibility ?? 1,
                  a?.visibility ?? 1,
                )
                angle = smootherRef.current.push(jointAngle(cfg, a, j, b))
              } else {
                activeSideRef.current = null
              }
            }

            onFrameRef.current?.({ angle, side, points, timeMs: now, confidence })
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
      internalStream?.getTracks().forEach((t) => t.stop())
      landmarker?.close()
    }
  }, [externalVideo])

  return { videoRef: internalVideoRef, ready, error }
}

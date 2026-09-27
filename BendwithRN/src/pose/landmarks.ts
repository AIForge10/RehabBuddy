// The landmark shape the native MediaPipe module hands up, and the tuning knobs the
// form checks read. Both are declared here rather than imported from
// @mediapipe/tasks-vision: that package is the browser's WASM build, which cannot load
// in React Native. The fields match MediaPipe's own NormalizedLandmark so the pose
// logic copied from frontend/src/pose/ compiles unchanged.

/** One landmark in normalized image space: x,y in 0..1, z relative, visibility 0..1. */
export interface NormalizedLandmark {
  x: number
  y: number
  z: number
  visibility: number
}

/** What the Kotlin module emits per frame (see android/.../PoseModule.kt). */
export interface PoseFrame {
  /** 33 pose landmarks, MediaPipe's own order. Empty when no person was found. */
  landmarks: NormalizedLandmark[]
  /** Frame size in pixels: angles are measured on pixels, never on normalized values. */
  width: number
  height: number
  /** Device clock, milliseconds. */
  timestamp: number
}

/**
 * The subset of the web tracker's PoseTuning that the ported code reads, with the same
 * values (frontend/src/pose/tracker.ts DEFAULT_TUNING). The web-only knobs are left out:
 * model/delegate are set in Kotlin, and handModel, median, switchFrames and followSwaps
 * belong to the browser tracker this port does not have yet.
 */
export interface PoseTuning {
  /** A limb counts as seen when its joint and distal point are both at least this visible. */
  minVisibility: number
  /** '2d': angle in the image plane (camera side-on). '3d' needs world landmarks, which
   *  the native module does not emit yet, so keep this '2d'. */
  angleSource: '2d' | '3d'
  /** One Euro filter on every landmark before anything is measured. */
  smoothLandmarks: boolean
  lmMinCutoff: number
  /** Per frame-diagonal/s. */
  lmBeta: number
  /** Form checks (form.ts). Off = never flag a form fault. */
  formCheck: boolean
  /** A fault counts once it has held this long, and clears once it has been gone this long. */
  formHoldMs: number
  /** Knee: the thigh turns this far from where it lay at rest. */
  thighMoveDeg: number
  /** Hip: the trunk leans back this far past vertical. */
  leanBackDeg: number
  /** Elbow: the upper arm swings this far off vertical. */
  elbowDriftDeg: number
  /** Shoulder: the shoulder closes this share (%) of the ear-to-shoulder gap it had at rest. */
  shrugPct: number
  /** Shoulder: shrugging is only judged below this arm angle. */
  shrugMaxArm: number
}

export const DEFAULT_TUNING: PoseTuning = {
  minVisibility: 0.5,
  angleSource: '2d',
  smoothLandmarks: true,
  lmMinCutoff: 1,
  lmBeta: 60,
  formCheck: true,
  formHoldMs: 500,
  thighMoveDeg: 20,
  leanBackDeg: 25,
  elbowDriftDeg: 30,
  shrugPct: 35,
  shrugMaxArm: 100,
}

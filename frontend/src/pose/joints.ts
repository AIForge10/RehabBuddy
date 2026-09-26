// joint library. SAME values as JOINTS in ml/angle_prototype.py.
// Adding a new joint = adding one entry here.
// a / joint / b: MediaPipe landmark indices as [left, right]
// mode 'flexion': angle = 180 - theta (straight limb = 0)   -> knee, hip, elbow, wrist
// mode 'raw':     angle = theta (arm at side ≈ 0, raised = up) -> shoulder
export type JointName = 'knee' | 'hip' | 'elbow' | 'shoulder' | 'wrist'

/** Form faults the camera can see (see form.ts). Saved with the session as these codes. */
export type FormFault = 'thigh_moving' | 'leaning_back' | 'elbow_drifting' | 'shrugging'

export interface JointConfig {
  label: string
  a: [number, number]
  joint: [number, number]
  b: [number, number]
  mode: 'flexion' | 'raw'
  bent: number
  straight: number
  /**
   * Reading at the start position, for a joint that doesn't start straight (the
   * seated hip). The rep counter then shifts `bent` and `straight` by however far
   * the rest it sees is from this; see repCounter.ts.
   */
  rest?: number
  target: number
  tip: string
  /** The one form fault checked for this joint, if any. Browser only (not in the Python prototype). */
  fault?: FormFault
}

export const JOINTS: Record<JointName, JointConfig> = {
  knee: {
    label: 'Knee', a: [23, 24], joint: [25, 26], b: [27, 28], mode: 'flexion',
    bent: 45, straight: 20, target: 90,
    tip: 'Stand side-on, whole leg in frame, bend your knee',
    fault: 'thigh_moving',
  },
  hip: {
    label: 'Hip', a: [11, 12], joint: [23, 24], b: [25, 26], mode: 'flexion',
    // Seated knee lifts: sitting already reads ~86° (lib/exercises.ts HIP_SEATED),
    // so the band sits above that, and follows the rest reading (repCounter.ts).
    rest: 86, bent: 100, straight: 93, target: 115,
    tip: 'Sit side-on, feet flat, lift your knee towards your chest',
    fault: 'leaning_back',
  },
  elbow: {
    label: 'Elbow', a: [11, 12], joint: [13, 14], b: [15, 16], mode: 'flexion',
    bent: 60, straight: 25, target: 130,
    tip: 'Sit side-on, arm straight down, curl your forearm up',
    fault: 'elbow_drifting',
  },
  shoulder: {
    label: 'Shoulder', a: [23, 24], joint: [11, 12], b: [13, 14], mode: 'raw',
    bent: 60, straight: 30, target: 90,
    tip: 'Face the camera, arm at your side, raise it out sideways',
    fault: 'shrugging',
  },
  wrist: {
    label: 'Wrist (experimental)', a: [13, 14], joint: [15, 16], b: [19, 20], mode: 'flexion',
    bent: 35, straight: 15, target: 60,
    tip: 'Forearm side-on on the desk, bend your hand up/down',
  },
}

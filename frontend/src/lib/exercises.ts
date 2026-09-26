// The exercise catalog: one seated exercise per joint. Each one is data for the
// same rigged figure (see bodyGeometry), so adding an exercise never needs new
// artwork: it's a pose for a given angle, the three joints the tracker
// measures, how to frame the stage, and the patient-facing copy.
//
// Angles are clinical readings of the three-point angle θ the tracker sees
// from a side-on camera: `flexion` = 180° − θ (knee, hip, elbow, wrist),
// `direct` = θ (shoulder). A straight limb reads 0°, except the seated hip,
// which starts near 90° because sitting is already hip flexion.

import { REST_POSE, TRUNK, type Joint, type Pose } from './bodyGeometry'
import type { FormFault } from '../pose/joints'
import type { Assignment, Language } from '../types/session'

export type BodyPart = 'knee' | 'hip' | 'shoulder' | 'elbow' | 'wrist'

export const BODY_PARTS: readonly BodyPart[] = ['knee', 'hip', 'shoulder', 'elbow', 'wrist']

/** A viewBox in stage units (the stage is 720 × 450; keep the 16:10 ratio). */
export interface View {
  x: number
  y: number
  w: number
  h: number
}

interface Copy {
  /** Picker label. */
  part: string
  name: string
  /** Live panel label for the angle. */
  angleLabel: string
  toTarget: (angle: number) => string
  briefSub: (reps: number, angle: number) => string
  /** Narrates the four phases of the demo loop: start, move, hold, return. */
  steps: readonly { title: string; body: string }[]
  safety: string
  /** Camera-setup checks 1 and 2 (check 3, the lighting, is the same for every exercise). */
  camera: { title: string; body: string; tip: string }
  frame: { title: string; body: string; tip: string }
  /** Label on the dashed camera-height line in setup. */
  cameraLine: string
  /** Names of the three measured joints, in `measure` order. */
  joints: readonly [string, string, string]
  hidden: string
  painTitle: string
  /** Results: the session's best angle, and the progress chart's subtitle. */
  best: string
  bestSub: string
  /** Coach lines that name the movement; the rest of the coach is shared. `form` is said when `formWarning` is seen. */
  cues: { start: string; bend_deeper: string; form: string }
}

export interface Exercise {
  id: string
  part: BodyPart
  /** Reading at the start position. */
  rest: number
  /** Default prescription when the therapist hasn't set one for this joint. */
  target: number
  /** Gauge range. */
  min: number
  max: number
  /** The figure's pose for a reading. */
  pose: (angle: number) => Pose
  /** The three points of the measured angle: proximal, vertex, distal. */
  measure: readonly [Joint, Joint, Joint]
  /** End of the moving limb, where the target marker goes (defaults to the distal point). */
  reach?: Joint
  /** Skeleton drawn over the figure while tracking. */
  chain: readonly Joint[]
  /** Where setup puts each measured joint's name. */
  labels: readonly ['above' | 'below' | 'left' | 'right', 'above' | 'below' | 'left' | 'right', 'above' | 'below' | 'left' | 'right']
  /** MediaPipe Pose landmark indices of the measured points, for whichever side faces the camera. */
  landmarks: { left: readonly [number, number, number]; right: readonly [number, number, number] }
  reading: 'flexion' | 'direct'
  /** The form fault the camera checks on this exercise, as in JOINTS[part].fault (pose/joints.ts); null when it checks none. */
  formWarning: FormFault | null
  /** Height of the camera line in setup, stage units. */
  cameraY: number
  view: View
  copy: Record<Language, Copy>
}

const HOLD = { en: { title: 'Hold', body: 'Pause for a second at the top.' }, es: { title: 'Mantén', body: 'Una pausa de un segundo arriba.' } }

/** Sitting normally: feet flat on the floor. */
const SEATED = { ...REST_POSE, knee: 90 }

const knee: Exercise = {
  id: 'ex-knee-bend',
  part: 'knee',
  rest: 0,
  target: 90,
  min: 0,
  max: 120,
  pose: (a) => ({ ...REST_POSE, knee: a }),
  measure: ['hip', 'knee', 'ankle'],
  chain: ['shoulder', 'hip', 'knee', 'ankle', 'toe'],
  labels: ['left', 'above', 'below'],
  landmarks: { left: [23, 25, 27], right: [24, 26, 28] },
  reading: 'flexion',
  formWarning: 'thigh_moving',
  cameraY: 270,
  view: { x: 28, y: 0, w: 720, h: 450 },
  copy: {
    en: {
      part: 'Knee',
      name: 'Seated knee bends',
      angleLabel: 'Knee bend',
      toTarget: (a) => `Bend to ${a}°`,
      briefSub: (reps, a) => `Watch one rep. Then you’ll do ${reps}, bending to ${a}°.`,
      steps: [
        { title: 'Start straight', body: 'Sit tall, leg straight out in front.' },
        { title: 'Bend slowly', body: 'Draw your heel back to the dotted line.' },
        { title: 'Hold', body: 'Pause for a second at the deepest point.' },
        { title: 'Straighten fully', body: 'Extend until your leg is straight again.' },
      ],
      safety: 'Keep your thigh on the chair, and stop if you feel sharp pain.',
      camera: { title: 'Camera at knee height', body: 'Side-on to you, about 2 m away.', tip: 'Camera level with your knee, 2 m to your side' },
      frame: { title: 'Whole leg in frame', body: 'Hip, knee and ankle visible.', tip: 'Hip, knee and ankle inside the frame' },
      cameraLine: 'Knee height',
      joints: ['Hip', 'Knee', 'Ankle'],
      hidden: 'Move so your whole leg is visible',
      painTitle: 'How does your knee feel?',
      best: 'Deepest bend',
      bestSub: 'Deepest bend, each session',
      cues: { start: 'Let’s begin. Bend your knee slowly.', bend_deeper: 'Try to bend a little deeper.', form: 'Keep your thigh still on the chair.' },
    },
    es: {
      part: 'Rodilla',
      name: 'Flexiones de rodilla en silla',
      angleLabel: 'Flexión de rodilla',
      toTarget: (a) => `Dobla hasta ${a}°`,
      briefSub: (reps, a) => `Mira una repetición. Luego harás ${reps}, doblando hasta ${a}°.`,
      steps: [
        { title: 'Empieza con la pierna recta', body: 'Siéntate derecho, pierna estirada al frente.' },
        { title: 'Dobla despacio', body: 'Lleva el talón hacia atrás hasta la línea punteada.' },
        { title: 'Mantén', body: 'Una pausa de un segundo en el punto más profundo.' },
        { title: 'Estira por completo', body: 'Extiende hasta que la pierna quede recta.' },
      ],
      safety: 'Mantén el muslo sobre la silla y para si sientes dolor agudo.',
      camera: { title: 'Cámara a la altura de la rodilla', body: 'De lado, a unos 2 m.', tip: 'Cámara a la altura de tu rodilla, a 2 m de tu lado' },
      frame: { title: 'Toda la pierna visible', body: 'Cadera, rodilla y tobillo.', tip: 'Cadera, rodilla y tobillo dentro del marco' },
      cameraLine: 'Altura de rodilla',
      joints: ['Cadera', 'Rodilla', 'Tobillo'],
      hidden: 'Colócate para que se vea toda la pierna',
      painTitle: '¿Cómo sientes la rodilla?',
      best: 'Flexión máxima',
      bestSub: 'Flexión máxima por sesión',
      cues: { start: 'Empecemos. Dobla la rodilla despacio.', bend_deeper: 'Intenta doblar un poco más.', form: 'Mantén el muslo quieto sobre la silla.' },
    },
  },
}

// Seated, the hip already reads about 90°: the trunk line runs down through
// the hip and the thigh lies level. Lifting the knee adds to that.
const HIP_SEATED = 90 - TRUNK

const hip: Exercise = {
  id: 'ex-hip-lift',
  part: 'hip',
  rest: Math.round(HIP_SEATED),
  target: 115,
  min: 80,
  max: 130,
  pose: (a) => {
    const lift = Math.max(0, a - HIP_SEATED)
    // Hands hold the sides of the seat; the shin stays upright as the knee rises.
    return { hip: lift, knee: 90 + lift, shoulder: 12, elbow: 22, wrist: -18 }
  },
  measure: ['shoulder', 'hip', 'knee'],
  chain: ['shoulder', 'hip', 'knee', 'ankle'],
  labels: ['above', 'left', 'above'],
  landmarks: { left: [11, 23, 25], right: [12, 24, 26] },
  reading: 'flexion',
  formWarning: 'leaning_back',
  cameraY: 270,
  view: { x: 30, y: 10, w: 672, h: 420 },
  copy: {
    en: {
      part: 'Hip',
      name: 'Seated knee lifts',
      angleLabel: 'Hip bend',
      toTarget: (a) => `Lift to ${a}°`,
      briefSub: (reps, a) => `Watch one rep. Then you’ll do ${reps}, lifting to ${a}°.`,
      steps: [
        { title: 'Sit tall', body: 'Feet flat, hands holding the sides of the seat.' },
        { title: 'Lift slowly', body: 'Raise your knee to the dotted line.' },
        HOLD.en,
        { title: 'Lower gently', body: 'Set your foot back down on the floor.' },
      ],
      safety: 'Keep your back straight, don’t lean back, and stop if you feel sharp pain.',
      camera: { title: 'Camera at hip height', body: 'Side-on to you, about 2 m away.', tip: 'Camera level with your hip, 2 m to your side' },
      frame: { title: 'Body and leg in frame', body: 'Shoulder, hip and knee visible.', tip: 'Shoulder, hip and knee inside the frame' },
      cameraLine: 'Hip height',
      joints: ['Shoulder', 'Hip', 'Knee'],
      hidden: 'Move so your shoulder, hip and knee are visible',
      painTitle: 'How does your hip feel?',
      best: 'Highest lift',
      bestSub: 'Highest lift, each session',
      cues: { start: 'Let’s begin. Lift your knee slowly.', bend_deeper: 'Try to lift a little higher.', form: 'Sit tall. Don’t lean back.' },
    },
    es: {
      part: 'Cadera',
      name: 'Elevaciones de rodilla en silla',
      angleLabel: 'Flexión de cadera',
      toTarget: (a) => `Sube hasta ${a}°`,
      briefSub: (reps, a) => `Mira una repetición. Luego harás ${reps}, subiendo hasta ${a}°.`,
      steps: [
        { title: 'Siéntate derecho', body: 'Pies apoyados, manos a los lados del asiento.' },
        { title: 'Sube despacio', body: 'Levanta la rodilla hasta la línea punteada.' },
        HOLD.es,
        { title: 'Baja con suavidad', body: 'Vuelve a apoyar el pie en el suelo.' },
      ],
      safety: 'Mantén la espalda recta, no te inclines hacia atrás y para si sientes dolor agudo.',
      camera: { title: 'Cámara a la altura de la cadera', body: 'De lado, a unos 2 m.', tip: 'Cámara a la altura de tu cadera, a 2 m de tu lado' },
      frame: { title: 'Tronco y pierna visibles', body: 'Hombro, cadera y rodilla.', tip: 'Hombro, cadera y rodilla dentro del marco' },
      cameraLine: 'Altura de cadera',
      joints: ['Hombro', 'Cadera', 'Rodilla'],
      hidden: 'Colócate para que se vean hombro, cadera y rodilla',
      painTitle: '¿Cómo sientes la cadera?',
      best: 'Elevación máxima',
      bestSub: 'Elevación máxima por sesión',
      cues: { start: 'Empecemos. Levanta la rodilla despacio.', bend_deeper: 'Intenta subir un poco más.', form: 'Siéntate derecho. No te inclines hacia atrás.' },
    },
  },
}

const shoulder: Exercise = {
  id: 'ex-shoulder-raise',
  part: 'shoulder',
  rest: 0,
  target: 140,
  min: 0,
  max: 180,
  // Straight arm swinging up from along the trunk line.
  pose: (a) => ({ ...SEATED, shoulder: a + TRUNK, elbow: 4, wrist: 0 }),
  measure: ['hip', 'shoulder', 'elbow'],
  // The straight arm moves as one piece, so aim the target at the hand.
  reach: 'finger',
  chain: ['hip', 'shoulder', 'elbow', 'wrist', 'finger'],
  labels: ['left', 'left', 'right'],
  landmarks: { left: [23, 11, 13], right: [24, 12, 14] },
  reading: 'direct',
  formWarning: 'shrugging',
  cameraY: 170,
  view: { x: -20, y: -70, w: 800, h: 500 },
  copy: {
    en: {
      part: 'Shoulder',
      name: 'Seated arm raises',
      angleLabel: 'Arm raise',
      toTarget: (a) => `Raise to ${a}°`,
      briefSub: (reps, a) => `Watch one rep. Then you’ll do ${reps}, raising your arm to ${a}°.`,
      steps: [
        { title: 'Arm by your side', body: 'Sit tall, arm straight down, thumb forward.' },
        { title: 'Raise slowly', body: 'Lift your straight arm forward to the dotted line.' },
        HOLD.en,
        { title: 'Lower slowly', body: 'Bring your arm back down to your side.' },
      ],
      safety: 'Keep your elbow straight and your shoulder down, and stop if you feel sharp pain.',
      camera: { title: 'Camera at chest height', body: 'Side-on to you, about 2 m away.', tip: 'Camera level with your chest, 2 m to your side' },
      frame: { title: 'Whole arm in frame', body: 'Hip, shoulder and elbow visible, with room overhead.', tip: 'Hip, shoulder and elbow in frame, room overhead' },
      cameraLine: 'Chest height',
      joints: ['Hip', 'Shoulder', 'Elbow'],
      hidden: 'Move so your whole arm is visible',
      painTitle: 'How does your shoulder feel?',
      best: 'Highest raise',
      bestSub: 'Highest raise, each session',
      cues: { start: 'Let’s begin. Raise your arm slowly.', bend_deeper: 'Try to raise it a little higher.', form: 'Keep your shoulder down, away from your ear.' },
    },
    es: {
      part: 'Hombro',
      name: 'Elevaciones de brazo en silla',
      angleLabel: 'Elevación del brazo',
      toTarget: (a) => `Sube hasta ${a}°`,
      briefSub: (reps, a) => `Mira una repetición. Luego harás ${reps}, subiendo el brazo hasta ${a}°.`,
      steps: [
        { title: 'Brazo al costado', body: 'Siéntate derecho, brazo estirado hacia abajo, pulgar al frente.' },
        { title: 'Sube despacio', body: 'Levanta el brazo estirado hacia delante hasta la línea punteada.' },
        HOLD.es,
        { title: 'Baja despacio', body: 'Vuelve a bajar el brazo al costado.' },
      ],
      safety: 'Mantén el codo estirado y el hombro abajo, y para si sientes dolor agudo.',
      camera: { title: 'Cámara a la altura del pecho', body: 'De lado, a unos 2 m.', tip: 'Cámara a la altura de tu pecho, a 2 m de tu lado' },
      frame: { title: 'Todo el brazo visible', body: 'Cadera, hombro y codo, con espacio arriba.', tip: 'Cadera, hombro y codo en el marco, con espacio arriba' },
      cameraLine: 'Altura del pecho',
      joints: ['Cadera', 'Hombro', 'Codo'],
      hidden: 'Colócate para que se vea todo el brazo',
      painTitle: '¿Cómo sientes el hombro?',
      best: 'Elevación máxima',
      bestSub: 'Elevación máxima por sesión',
      cues: { start: 'Empecemos. Levanta el brazo despacio.', bend_deeper: 'Intenta subirlo un poco más.', form: 'Mantén el hombro abajo, lejos de la oreja.' },
    },
  },
}

const elbow: Exercise = {
  id: 'ex-elbow-bend',
  part: 'elbow',
  rest: 0,
  target: 130,
  min: 0,
  max: 150,
  // Upper arm stays along the trunk; the forearm curls up.
  pose: (a) => ({ ...SEATED, shoulder: TRUNK, elbow: a, wrist: 0 }),
  measure: ['shoulder', 'elbow', 'wrist'],
  chain: ['hip', 'shoulder', 'elbow', 'wrist', 'finger'],
  labels: ['left', 'left', 'right'],
  landmarks: { left: [11, 13, 15], right: [12, 14, 16] },
  reading: 'flexion',
  formWarning: 'elbow_drifting',
  cameraY: 170,
  view: { x: 58, y: 10, w: 640, h: 400 },
  copy: {
    en: {
      part: 'Elbow',
      name: 'Seated elbow bends',
      angleLabel: 'Elbow bend',
      toTarget: (a) => `Bend to ${a}°`,
      briefSub: (reps, a) => `Watch one rep. Then you’ll do ${reps}, bending to ${a}°.`,
      steps: [
        { title: 'Arm straight', body: 'Sit tall, arm down by your side, palm forward.' },
        { title: 'Bend slowly', body: 'Bring your hand up to the dotted line.' },
        { title: 'Hold', body: 'Pause for a second at the deepest point.' },
        { title: 'Straighten fully', body: 'Lower until your arm is straight again.' },
      ],
      safety: 'Keep your elbow tucked in at your side, and stop if you feel sharp pain.',
      camera: { title: 'Camera at chest height', body: 'Side-on to you, about 2 m away.', tip: 'Camera level with your chest, 2 m to your side' },
      frame: { title: 'Whole arm in frame', body: 'Shoulder, elbow and wrist visible.', tip: 'Shoulder, elbow and wrist inside the frame' },
      cameraLine: 'Chest height',
      joints: ['Shoulder', 'Elbow', 'Wrist'],
      hidden: 'Move so your whole arm is visible',
      painTitle: 'How does your elbow feel?',
      best: 'Deepest bend',
      bestSub: 'Deepest bend, each session',
      cues: { start: 'Let’s begin. Bend your elbow slowly.', bend_deeper: 'Try to bend a little further.', form: 'Keep your elbow by your side.' },
    },
    es: {
      part: 'Codo',
      name: 'Flexiones de codo en silla',
      angleLabel: 'Flexión de codo',
      toTarget: (a) => `Dobla hasta ${a}°`,
      briefSub: (reps, a) => `Mira una repetición. Luego harás ${reps}, doblando hasta ${a}°.`,
      steps: [
        { title: 'Brazo estirado', body: 'Siéntate derecho, brazo al costado, palma al frente.' },
        { title: 'Dobla despacio', body: 'Sube la mano hasta la línea punteada.' },
        { title: 'Mantén', body: 'Una pausa de un segundo en el punto más profundo.' },
        { title: 'Estira por completo', body: 'Baja hasta que el brazo quede recto.' },
      ],
      safety: 'Mantén el codo pegado al cuerpo y para si sientes dolor agudo.',
      camera: { title: 'Cámara a la altura del pecho', body: 'De lado, a unos 2 m.', tip: 'Cámara a la altura de tu pecho, a 2 m de tu lado' },
      frame: { title: 'Todo el brazo visible', body: 'Hombro, codo y muñeca.', tip: 'Hombro, codo y muñeca dentro del marco' },
      cameraLine: 'Altura del pecho',
      joints: ['Hombro', 'Codo', 'Muñeca'],
      hidden: 'Colócate para que se vea todo el brazo',
      painTitle: '¿Cómo sientes el codo?',
      best: 'Flexión máxima',
      bestSub: 'Flexión máxima por sesión',
      cues: { start: 'Empecemos. Dobla el codo despacio.', bend_deeper: 'Intenta doblar un poco más.', form: 'Mantén el codo junto al cuerpo.' },
    },
  },
}

const wrist: Exercise = {
  id: 'ex-wrist-lift',
  part: 'wrist',
  rest: REST_POSE.wrist,
  target: 60,
  min: 0,
  max: 90,
  // Forearm resting on the thigh, palm down; the hand tips up at the wrist.
  pose: (a) => ({ ...SEATED, wrist: a }),
  measure: ['elbow', 'wrist', 'finger'],
  chain: ['shoulder', 'elbow', 'wrist', 'finger'],
  labels: ['left', 'below', 'right'],
  landmarks: { left: [13, 15, 19], right: [14, 16, 20] },
  reading: 'flexion',
  // The wrist angle is still experimental, so its form isn't judged.
  formWarning: null,
  cameraY: 240,
  view: { x: 150, y: 22, w: 448, h: 280 },
  copy: {
    en: {
      part: 'Wrist',
      name: 'Seated wrist lifts',
      angleLabel: 'Wrist lift',
      toTarget: (a) => `Lift to ${a}°`,
      briefSub: (reps, a) => `Watch one rep. Then you’ll do ${reps}, lifting your hand to ${a}°.`,
      steps: [
        { title: 'Rest your forearm', body: 'Forearm on your thigh, palm down.' },
        { title: 'Lift slowly', body: 'Raise the back of your hand to the dotted line.' },
        HOLD.en,
        { title: 'Lower gently', body: 'Let your hand come back down to your leg.' },
      ],
      safety: 'Keep your forearm resting on your leg, and stop if you feel sharp pain.',
      camera: { title: 'Camera at lap height', body: 'Side-on to you, about 1 m away.', tip: 'Camera level with your lap, 1 m to your side' },
      frame: { title: 'Forearm and hand in frame', body: 'Elbow, wrist and fingers visible.', tip: 'Elbow, wrist and fingers inside the frame' },
      cameraLine: 'Lap height',
      joints: ['Elbow', 'Wrist', 'Fingers'],
      hidden: 'Move so your forearm and hand are visible',
      painTitle: 'How does your wrist feel?',
      best: 'Highest lift',
      bestSub: 'Highest lift, each session',
      cues: { start: 'Let’s begin. Lift your hand slowly.', bend_deeper: 'Try to lift your hand a little higher.', form: 'Keep your forearm down on your leg.' },
    },
    es: {
      part: 'Muñeca',
      name: 'Elevaciones de muñeca en silla',
      angleLabel: 'Extensión de muñeca',
      toTarget: (a) => `Sube hasta ${a}°`,
      briefSub: (reps, a) => `Mira una repetición. Luego harás ${reps}, subiendo la mano hasta ${a}°.`,
      steps: [
        { title: 'Apoya el antebrazo', body: 'Antebrazo sobre el muslo, palma hacia abajo.' },
        { title: 'Sube despacio', body: 'Levanta el dorso de la mano hasta la línea punteada.' },
        HOLD.es,
        { title: 'Baja con suavidad', body: 'Vuelve a apoyar la mano en la pierna.' },
      ],
      safety: 'Mantén el antebrazo apoyado en la pierna y para si sientes dolor agudo.',
      camera: { title: 'Cámara a la altura del regazo', body: 'De lado, a 1 m.', tip: 'Cámara a la altura de tu regazo, a 1 m de tu lado' },
      frame: { title: 'Antebrazo y mano visibles', body: 'Codo, muñeca y dedos.', tip: 'Codo, muñeca y dedos dentro del marco' },
      cameraLine: 'Altura del regazo',
      joints: ['Codo', 'Muñeca', 'Dedos'],
      hidden: 'Colócate para que se vean el antebrazo y la mano',
      painTitle: '¿Cómo sientes la muñeca?',
      best: 'Elevación máxima',
      bestSub: 'Elevación máxima por sesión',
      cues: { start: 'Empecemos. Levanta la mano despacio.', bend_deeper: 'Intenta subir la mano un poco más.', form: 'Mantén el antebrazo apoyado en la pierna.' },
    },
  },
}

export const EXERCISES: Record<BodyPart, Exercise> = { knee, hip, shoulder, elbow, wrist }

/** The catalog entry for an assignment's `exercise.joint`; unknown joints fall back to the knee. */
export function exerciseFor(joint: string): Exercise {
  return EXERCISES[joint as BodyPart] ?? knee
}

/**
 * The assignment as it applies to `exercise`: unchanged for the joint the
 * therapist assigned; for any other joint, that exercise with its catalog
 * target (the rep count and schedule carry over).
 */
export function assignmentFor(assignment: Assignment, exercise: Exercise): Assignment {
  if (assignment.exercise.joint === exercise.part) return assignment
  const { name, steps } = exercise.copy.en
  return {
    ...assignment,
    exercise: { id: exercise.id, name, joint: exercise.part, instructions: steps.map((s) => s.body).join(' ') },
    target_angle: exercise.target,
  }
}

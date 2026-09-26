import { useId, type CSSProperties, type ReactNode } from 'react'
import { ANKLE_H, ELBOW, FLOOR_Y, HIP, KNEE, MAX_FLEX, REST_POSE, SHIN, SHOULDER, WRIST, ankleAt, shinPoint, type Pose } from '../lib/bodyGeometry'

// Side view of a woman sitting on a wooden dining chair, her near (right) leg
// free to swing at the knee. One set of shapes drives every figure in the app:
// the shaded figure on the stage (demo + live fallback), the flat hero on the
// home card, and the alignment ghost and lighting examples in camera setup.
// Ghost, flat and silhouette take their color from `currentColor`. Stage space
// is 720 × 450.
//
// Contours are lists of points smoothed into curves. The shin, sock and shoe
// are drawn with the leg straight out (0°) and turned about the knee with an
// SVG rotate, so their shading turns with the limb as it would on a real leg.
// The shoe and sock are drawn standing (toes → +x, sole on y = 0, ankle joint
// 20 above it) and placed under the ankle by SHOE_AT.
//
// She's a puppet rigged the same way throughout (see Pose in bodyGeometry):
// the arm is drawn hanging straight down and turned at the shoulder, elbow
// and wrist; the thigh turns at the hip. Every exercise is a pose, not a
// drawing. Lifting the thigh splits the lap along the hip crease so her seat
// stays on the chair while the leg rises.

type Pt = readonly [number, number] | readonly [number, number, 1]
type P2 = [number, number]

/** Smooth path through `pts`; a third element marks a sharp corner. Handles
 *  scale with each segment's length, so uneven spacing never overshoots. */
function outline(pts: readonly Pt[], closed = true): string {
  const n = pts.length
  const at = (i: number) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))]
  const dir = (i: number): P2 | null => {
    const p = at(i)
    if (p.length > 2 || (!closed && (i === 0 || i === n - 1))) return null
    const a = at(i - 1)
    const b = at(i + 1)
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    return [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
  }
  const f = (v: number) => Math.round(v * 100) / 100
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p = at(i)
    const q = at(i + 1)
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]) / 3
    const t1 = dir(i)
    const t2 = dir(i + 1)
    const c1 = t1 ? [p[0] + t1[0] * len, p[1] + t1[1] * len] : [p[0] + (q[0] - p[0]) / 3, p[1] + (q[1] - p[1]) / 3]
    const c2 = t2 ? [q[0] - t2[0] * len, q[1] - t2[1] * len] : [q[0] - (q[0] - p[0]) / 3, q[1] - (q[1] - p[1]) / 3]
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(q[0])} ${f(q[1])}`
  }
  return closed ? `${d}Z` : d
}

// ---- Person (stage coordinates, near leg straight out) ----

const HEAD = outline([
  [287, 114, 1], [285.8, 100], [284.4, 88], [277.6, 76], [275.6, 60], [279.8, 44.4], [290.6, 34.6], [303, 32],
  [317, 35.4], [325.6, 43.4], [328.8, 51], [330.6, 57.2, 1], [329.4, 61.4, 1], [333.2, 66.6], [336.7, 70.8],
  [337.6, 73.2], [335.6, 74.9], [332.4, 76.2, 1], [333.2, 78.6], [333.8, 80.4], [331.1, 83, 1], [333, 85.5],
  [331.3, 88.3], [329.8, 89.6, 1], [331.3, 92.8], [330.3, 96.6], [325.6, 98.9], [319.6, 99.9], [317.2, 104],
  [317.5, 109], [318.6, 114, 1],
])
const EYE = 'M318.8 64.4Q322.4 62 325.8 63.7Q323 66.2 318.8 64.4Z'
const EAR = outline([
  [304.8, 65.8], [301.4, 62.6], [296.8, 63.4], [294.8, 68], [295.2, 74], [297.4, 79], [300.8, 81.6], [303.4, 79.8],
  [304.2, 75.8], [305.3, 71],
])
const HAIR = outline([
  [324.4, 42.4, 1], [322, 37.2], [317.4, 32], [304.8, 28.8], [290, 30], [279.4, 37], [273.2, 48], [271.8, 58],
  [273.2, 70], [277.6, 79.4], [283.2, 87.6], [287.8, 90.8, 1], [291.2, 85], [292.8, 76], [293.4, 67.6],
  [295.8, 62.4], [300.6, 60.6], [305.4, 62.4], [307.4, 64.2, 1], [308, 59], [311, 53.6], [316.4, 47.8], [321, 44.2],
])
const BUN = outline([
  [266, 51.4], [274.2, 55], [276.8, 63], [273.8, 72], [265.6, 75.4], [257.4, 71.2], [254.6, 62.8], [258, 54.6],
])
const SHIRT = outline([
  [318.6, 112.4, 1], [325.4, 116.6], [331.4, 124], [338.6, 135.6], [344.6, 146.6], [347, 157.4], [345.4, 167.4],
  [340, 174.8], [336.8, 183], [336.4, 196], [338.4, 210], [341.6, 224], [345, 236], [347.6, 245.4],
  [344.8, 249.6, 1], [326, 252.8], [302, 254], [281.4, 251.4, 1], [279.6, 242], [281, 230], [279.4, 214],
  [276, 196], [274.8, 176], [275.8, 154], [278.6, 134], [281.8, 121], [286.4, 108.6, 1], [296, 109.8], [307, 111.8],
])
// Arm, drawn hanging straight down in segments that each turn about a joint.
// (v, u): v across the limb (+ = front, the side the elbow bends toward), u
// down it from the segment's joint.
type Vu = readonly [number, number] | readonly [number, number, 1]
const limb = (at: { x: number; y: number }, pts: readonly Vu[]) =>
  outline(pts.map(([v, u, c]) => (c ? ([at.x + v, at.y + u, 1] as const) : ([at.x + v, at.y + u] as const))))

const SLEEVE = limb(SHOULDER, [
  [-16.6, -3], [-11.6, -11.8], [-2.6, -15.4], [8.6, -13.2], [16.6, -6.4], [20.8, 4], [22.4, 18], [22.9, 32],
  [22.8, 43, 1], [10, 45.2], [-4, 44.8], [-16.8, 42.2, 1], [-18.2, 26], [-18.2, 10],
])
const UPPER_ARM = limb(SHOULDER, [
  [-14, 8, 1], [-15, 28], [-15, 48], [-14, 64], [-12.5, 76], [-9.5, 88], [-4, 95], [3, 96], [9, 92], [12.5, 84],
  [14, 72], [15.5, 58], [16, 42], [15.5, 24], [14, 8, 1],
])
const FOREARM = limb(ELBOW, [
  [-12.5, -2], [-12.6, 10], [-11.8, 24], [-10.4, 38], [-9, 52], [-8, 63], [-7.6, 70], [-5, 75], [0, 76.5],
  [5.4, 75], [8, 70], [8.8, 62], [10.6, 48], [12.8, 32], [13.8, 18], [13.6, 6], [11.6, -4], [6.6, -10.6],
  [0, -12.6], [-6.6, -10.6], [-10.8, -6],
])
// Seen from the little-finger side: palm at −v, back of the hand at +v.
const HAND = limb(WRIST, [
  [-7.6, -3], [-9.2, 6], [-10, 14], [-9.6, 22], [-8.6, 28], [-7.4, 34], [-6.8, 40], [-7, 45], [-7.8, 49.4],
  [-7.4, 53], [-4.6, 54.2], [-2, 51.6], [0, 47], [2.2, 41], [4.6, 34.6], [6.8, 28], [8.4, 20], [8.8, 12], [8.4, 4],
  [7.6, -3], [4, -7], [0, -8], [-4, -7],
])
const at = (o: { x: number; y: number }, v: number, u: number) => `${o.x + v} ${o.y + u}`
const THIGH = outline([
  [296, 246], [322, 244.2], [348, 244.4], [372, 246.6], [396, 249.8], [414, 253.4], [424, 254.2], [431, 254],
  [440, 256.6], [445.4, 263.6], [446, 270], [444.2, 277.6], [438.6, 283.6], [430, 286], [420, 288.4], [410, 289.8],
  [404, 290, 1], [296, 290, 1], [284, 289], [276.4, 283.4], [272.6, 274], [272.4, 262], [275.4, 251],
])
const SHORTS = outline([
  [278, 236, 1], [312, 234.8], [344.6, 236.2, 1], [347.2, 241.4], [350.4, 244.4], [364, 244.2], [378.6, 244.4, 1],
  [379.8, 262], [380.6, 278], [381.6, 291.4, 1], [297, 291.4, 1], [284, 290.6], [275, 284.8], [270.8, 274.6],
  [270.4, 262], [273, 250],
])
const SHIN_SKIN = outline([
  [430, 254], [438, 254.2], [445.4, 255.2], [450, 255.2], [455.6, 254.6], [466, 255.2], [484, 256.6], [504, 258],
  [522, 259], [538, 259.6], [552, 259.6, 1], [553, 280.6, 1], [542, 280.2], [530, 280.8], [518, 282.2], [506, 285],
  [494, 288.4], [482, 291.2], [470, 292.4], [458, 291.8], [447, 289.6], [438, 287.4], [430, 286], [421.2, 282.8],
  [415.4, 276], [414, 270], [415.6, 262], [421, 256.4],
])
const KNEE_R = 16

// Lap split for a lifted thigh: her seat and waistband stay put (FIXED, stage
// space) while the thigh and shorts leg turn about the hip (LIFTED, drawn in
// the thigh's own frame so the cut turns with it). They overlap near the hip
// so no seam opens.
const FIXED_CLIP = 'M0 -200H720V247H322V650H0Z'
const LIFTED_CLIP = 'M300 241H720V650H300Z'

// Foot frame: toes → +x, sole on y = 0, ankle joint at (0, -ANKLE_H).
const SOCK = outline([[-13.8, -12, 1], [-13, -20], [-11.4, -27], [-10.8, -35.6, 1], [0, -36.8], [11, -35.8, 1], [11.2, -28], [10.6, -20], [9, -12, 1]])
const SHOE = outline([
  [-13, -20.6, 1], [-15.8, -16.4], [-16.9, -9], [-16.4, -3.8], [-13.8, 0.4], [-10.4, 0.6, 1], [47.5, 0.6, 1],
  [54, 0.4], [58.8, -1.4], [60, -4.6], [59.2, -9.4], [55, -12.8], [48.6, -15.6], [39.6, -17.6], [30.6, -19.8],
  [21.8, -22.2], [13.2, -25.6], [7.2, -28.2], [3, -29.6], [1, -28.6, 1], [-1.2, -22], [-4.2, -18.6], [-8.4, -17.8],
  [-11.6, -18.8],
])
const SHOE_AT = `translate(${KNEE.x + SHIN + ANKLE_H} ${KNEE.y}) rotate(-90)`

// The resting far leg: knee a little open so its foot peeks out ahead of the
// near one, sole flat on the floor, pushed back in depth (smaller, higher).
const FAR_DEG = 78
const FAR_ANKLE = ankleAt(FAR_DEG)
const FAR_FOOT_AT = `translate(${FAR_ANKLE.x.toFixed(2)} ${(FLOOR_Y + FAR_ANKLE.y - KNEE.y - SHIN).toFixed(2)})`
const FAR_DEPTH = 'matrix(0.95 0 0 0.95 18 13.5)' // scale 0.95 about (360, 270)

// ---- Chair (oak dining chair, near side; far legs share the shapes) ----

const REAR_POST = outline([
  [265.6, 410, 1], [270.8, 356], [276.4, 300], [277, 240], [275.8, 180], [274, 146], [272.4, 138.6], [268.4, 136],
  [263.4, 137], [261, 141, 1], [262.6, 180], [264.2, 240], [265.6, 300], [261, 356], [257, 410, 1],
])
const REAR_LEG = outline([[265.6, 410, 1], [270.8, 356], [276.4, 300, 1], [265.6, 300, 1], [261, 356], [257, 410, 1]])
const TOP_RAIL = outline([[264, 141.6, 1], [259.6, 142.8], [257.4, 147], [257.2, 170.6], [259.4, 176.6], [264.4, 177.8, 1]])
const SEAT = outline([[268, 289.6, 1], [398, 289.6], [405, 290.4], [407.8, 294.4], [405.6, 298.6], [399, 299.8], [268, 299.8, 1]])
const APRON = outline([[272, 299.8, 1], [390, 299.8, 1], [390, 312.4, 1], [372, 314.4], [290, 314.4], [272, 312.4, 1]])
const FRONT_LEG = outline([[386.4, 299.8, 1], [398.8, 299.8, 1], [396.4, 410, 1], [388.4, 410, 1]])
const STRETCHER = outline([[268.4, 355.6, 1], [388, 355.6, 1], [388, 362.8, 1], [268.4, 362.8, 1]])
const FAR_CHAIR = 'matrix(0.86 0 0 0.86 50.4 37.8)' // scale 0.86 about (360, 270)

// ---- Palette (shaded mode) ----
const C = {
  skinHi: '#e7b58f',
  skin: '#c98e67',
  skinLo: '#9a6346',
  skinDeep: '#6f432f',
  lip: '#b4675a',
  hair: '#261914',
  hairHi: '#5b4032',
  shirtHi: '#93b0d6',
  shirt: '#6687b2',
  shirtLo: '#44618a',
  shirtDeep: '#2f4566',
  shortsHi: '#4c5564',
  shorts: '#323946',
  shortsLo: '#20252d',
  sock: '#f1efea',
  sockLo: '#c8c4bc',
  shoe: '#f5f3ef',
  shoeLo: '#cdc8bf',
  tread: '#8d969c',
  accent: '#e07a5f',
  woodHi: '#d7aa77',
  wood: '#b98858',
  woodLo: '#8c603d',
  woodDeep: '#5c3e27',
  shade: '#0b1312',
}

export type BodyMode = 'shaded' | 'flat' | 'ghost' | 'silhouette'

export function SeatedBody({
  angle = 0,
  pose: posed,
  mode = 'shaded',
  animateTo,
  farLeg = true,
  chair: showChair = true,
}: {
  /** Knee flexion in degrees, with the rest of her in the resting pose. Ignored when `pose` or `animateTo` is set. */
  angle?: number
  /** Full rig pose, for exercises other than the knee. */
  pose?: Pose
  mode?: BodyMode
  /** Drive the shin with the CSS `knee` keyframes to this angle (decorative figures). */
  animateTo?: number
  farLeg?: boolean
  chair?: boolean
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const id = (name: string) => `${name}-${uid}`
  const url = (name: string) => `url(#${id(name)})`
  const css = animateTo != null
  const p: Pose = posed ?? { ...REST_POSE, knee: css ? 0 : angle }
  const deg = css ? 0 : Math.max(0, Math.min(MAX_FLEX, p.knee))
  const turn: { className?: string; style?: CSSProperties; transform?: string } = css
    ? { className: 'animate-knee', style: { transformOrigin: `${KNEE.x}px ${KNEE.y}px`, ['--bend' as string]: `${animateTo}deg` } }
    : { transform: `rotate(${deg.toFixed(2)} ${KNEE.x} ${KNEE.y})` }
  const lifted = !css && p.hip > 0
  const thigh = lifted ? `rotate(${(-p.hip).toFixed(2)} ${HIP.x} ${HIP.y})` : undefined
  const shoulderTurn = `rotate(${(-p.shoulder).toFixed(2)} ${SHOULDER.x} ${SHOULDER.y})`
  const elbowTurn = `rotate(${(-p.elbow).toFixed(2)} ${ELBOW.x} ${ELBOW.y})`
  const wristTurn = `rotate(${(-p.wrist).toFixed(2)} ${WRIST.x} ${WRIST.y})`

  /** The lap as one piece, or split at the hip crease when the thigh lifts. */
  const lap = (node: ReactNode) =>
    lifted ? (
      <>
        <g clipPath={url('fixed')}>{node}</g>
        <g transform={thigh}>
          <g clipPath={url('lifted')}>{node}</g>
        </g>
      </>
    ) : (
      node
    )
  const lapDefs = lifted && (
    <>
      <clipPath id={id('fixed')}>
        <path d={FIXED_CLIP} />
      </clipPath>
      <clipPath id={id('lifted')}>
        <path d={LIFTED_CLIP} />
      </clipPath>
    </>
  )

  // Silhouettes, fill inherited: used by the flat and ghost figures and for masks.
  const armShapes = (
    <g transform={shoulderTurn}>
      <g transform={elbowTurn}>
        <path d={FOREARM} />
        <g transform={wristTurn}>
          <path d={HAND} />
        </g>
      </g>
      <path d={UPPER_ARM} />
      <path d={SLEEVE} />
    </g>
  )
  const torsoShapes = (
    <>
      <path d={SHIRT} />
      <path d={HEAD} />
      <path d={HAIR} />
      <path d={BUN} />
      {lap(
        <>
          <path d={SHORTS} />
          <path d={THIGH} />
          <circle cx={KNEE.x} cy={KNEE.y} r={KNEE_R} />
        </>,
      )}
      {armShapes}
    </>
  )
  const shinShapes = (
    <>
      <path d={SHIN_SKIN} />
      <circle cx={KNEE.x} cy={KNEE.y} r={KNEE_R} />
      <g transform={SHOE_AT}>
        <path d={SOCK} />
        <path d={SHOE} />
      </g>
    </>
  )
  const nearShin = (node: ReactNode) => (
    <g transform={thigh}>
      <g {...turn}>{node}</g>
    </g>
  )
  // The far thigh only shows once the near one lifts off it.
  const farThigh = (node: ReactNode) => lifted && <g clipPath={url('lifted')}>{node}</g>
  const farShapes = (
    <g transform={FAR_DEPTH}>
      <g transform={`rotate(${FAR_DEG} ${KNEE.x} ${KNEE.y})`}>
        <path d={SHIN_SKIN} />
      </g>
      <g transform={FAR_FOOT_AT}>
        <path d={SOCK} />
        <path d={SHOE} />
      </g>
      {farThigh(
        <>
          <path d={THIGH} />
          <path d={SHORTS} />
        </>,
      )}
    </g>
  )
  const chairShapes = (far: boolean) => (
    <>
      {far ? <path d={REAR_LEG} /> : <path d={REAR_POST} />}
      <path d={FRONT_LEG} />
      <path d={STRETCHER} />
      {!far && <path d={SEAT} />}
    </>
  )

  if (mode === 'ghost') {
    // A single outline around the union of all shapes: stroke everything, then
    // mask out the interior so only the outer half of each stroke survives.
    const union = (
      <>
        {torsoShapes}
        {nearShin(shinShapes)}
      </>
    )
    return (
      <g aria-hidden="true">
        <defs>
          {lapDefs}
          <mask id={id('ghost')} maskUnits="userSpaceOnUse" x="-200" y="-200" width="1120" height="850">
            <rect x="-200" y="-200" width="1120" height="850" fill="white" />
            <g fill="black" stroke="black" strokeWidth="0.5">
              {union}
            </g>
          </mask>
          <mask id={id('ghost-chair')} maskUnits="userSpaceOnUse" x="-200" y="-200" width="1120" height="850">
            <rect x="-200" y="-200" width="1120" height="850" fill="white" />
            <g fill="black" stroke="black" strokeWidth="0.5">
              {chairShapes(false)}
              {union}
            </g>
          </mask>
        </defs>
        {showChair && (
          <g mask={url('ghost-chair')} stroke="currentColor" strokeOpacity="0.45" strokeWidth="3" strokeLinejoin="round" fill="none">
            {chairShapes(false)}
          </g>
        )}
        <g opacity="0.07" fill="currentColor">
          {union}
        </g>
        <g mask={url('ghost')} stroke="currentColor" strokeWidth="5" strokeLinejoin="round" fill="currentColor">
          {union}
        </g>
      </g>
    )
  }

  if (mode === 'silhouette') {
    return (
      <g aria-hidden="true" fill="currentColor">
        {lapDefs && <defs>{lapDefs}</defs>}
        {showChair && chairShapes(false)}
        {farLeg && farShapes}
        {torsoShapes}
        {nearShin(shinShapes)}
      </g>
    )
  }

  if (mode === 'flat') {
    // Each layer is translucent, so the chair and far leg are masked out
    // wherever the body covers them rather than showing through it.
    return (
      <g aria-hidden="true" fill="currentColor">
        <defs>
          {lapDefs}
          <mask id={id('flat')} maskUnits="userSpaceOnUse" x="-200" y="-200" width="1120" height="850">
            <rect x="-200" y="-200" width="1120" height="850" fill="white" />
            <g fill="black">
              {torsoShapes}
              {nearShin(shinShapes)}
            </g>
          </mask>
        </defs>
        <g mask={url('flat')}>
          {showChair && (
            <g opacity="0.13">
              <g transform={FAR_CHAIR}>{chairShapes(true)}</g>
              {chairShapes(false)}
            </g>
          )}
          {farLeg && <g opacity="0.12">{farShapes}</g>}
        </g>
        {/* One layer, shoe included, so overlapping parts don't stack their opacity */}
        <g opacity="0.3">
          {torsoShapes}
          {nearShin(shinShapes)}
        </g>
      </g>
    )
  }

  // ---- Shaded ----
  const sole = shinPoint({ ...p, knee: deg }, { x: KNEE.x + SHIN + ANKLE_H, y: KNEE.y - 20 })
  const contact = css ? 0 : Math.max(0, Math.min(1, (sole.y - (FLOOR_Y - 60)) / 60))
  const patella = css ? 0 : deg * 0.8

  return (
    <g aria-hidden="true">
      <defs>
        {lapDefs}
        {/* Skin */}
        <linearGradient id={id('face')} x1="276" y1="0" x2="338" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={C.skinLo} />
          <stop offset="0.55" stopColor={C.skin} />
          <stop offset="1" stopColor={C.skinHi} />
        </linearGradient>
        {/* Across the hanging arm, lit on the front; every segment shares it, so the straight arm reads as one limb and each part's copy turns with it. */}
        <linearGradient id={id('arm')} x1={SHOULDER.x + 16} y1="0" x2={SHOULDER.x - 15} y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={C.skinHi} />
          <stop offset="0.45" stopColor={C.skin} />
          <stop offset="1" stopColor={C.skinLo} />
        </linearGradient>
        {/* Thigh and shin share one ramp so the straight leg reads as one limb; the shin's copy turns with it. */}
        <linearGradient id={id('leg')} x1="0" y1="252" x2="0" y2="291" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={C.skinHi} />
          <stop offset="0.42" stopColor={C.skin} />
          <stop offset="1" stopColor={C.skinLo} />
        </linearGradient>
        <radialGradient id={id('knee')} cx="0.5" cy="0.35" r="0.6">
          <stop offset="0" stopColor={C.skinHi} stopOpacity="0.9" />
          <stop offset="1" stopColor={C.skinHi} stopOpacity="0" />
        </radialGradient>

        {/* Clothes, hair */}
        <linearGradient id={id('shirt')} x1="350" y1="118" x2="276" y2="252" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={C.shirtHi} />
          <stop offset="0.45" stopColor={C.shirt} />
          <stop offset="1" stopColor={C.shirtLo} />
        </linearGradient>
        <linearGradient id={id('sleeve')} x1="0" y1="0" x2="1" y2="0.4">
          <stop offset="0" stopColor={C.shirtLo} />
          <stop offset="0.6" stopColor={C.shirt} />
          <stop offset="1" stopColor={C.shirtHi} />
        </linearGradient>
        <linearGradient id={id('shorts')} x1="0" y1="234" x2="0" y2="292" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={C.shortsHi} />
          <stop offset="0.5" stopColor={C.shorts} />
          <stop offset="1" stopColor={C.shortsLo} />
        </linearGradient>
        <linearGradient id={id('hair')} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={C.hairHi} />
          <stop offset="0.45" stopColor={C.hair} />
        </linearGradient>
        <linearGradient id={id('sock')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={C.sockLo} />
          <stop offset="0.7" stopColor={C.sock} />
        </linearGradient>
        <linearGradient id={id('shoe')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.shoe} />
          <stop offset="1" stopColor={C.shoeLo} />
        </linearGradient>

        {/* Wood: legs lit from the front, seat lit from above */}
        <linearGradient id={id('woodV')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={C.woodLo} />
          <stop offset="0.6" stopColor={C.wood} />
          <stop offset="0.85" stopColor={C.woodHi} />
          <stop offset="1" stopColor={C.wood} />
        </linearGradient>
        <linearGradient id={id('woodH')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.woodHi} />
          <stop offset="0.35" stopColor={C.wood} />
          <stop offset="1" stopColor={C.woodLo} />
        </linearGradient>
        <linearGradient id={id('underSeat')} x1="0" y1="299" x2="0" y2="330" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={C.shade} stopOpacity="0.55" />
          <stop offset="1" stopColor={C.shade} stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id('floorShadow')}>
          <stop offset="0" stopColor="black" stopOpacity="0.55" />
          <stop offset="1" stopColor="black" stopOpacity="0" />
        </radialGradient>

        <filter id={id('soft')} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <filter id={id('softer')} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <RimLight id={id('rim')} strength={0.5} />
        <RimLight id={id('rimSoft')} strength={0.22} />
        <clipPath id={id('clipEye')}>
          <path d={EYE} />
        </clipPath>
        <clipPath id={id('clipHair')}>
          <path d={HAIR} />
          <path d={BUN} />
        </clipPath>
        <clipPath id={id('clipShirt')}>
          <path d={SHIRT} />
        </clipPath>
        <clipPath id={id('clipHead')}>
          <path d={HEAD} />
        </clipPath>
        <clipPath id={id('clipLap')}>
          <path d={SHORTS} />
          <path d={THIGH} />
        </clipPath>
        {/* The lap where it is now, for the arm's shadow */}
        <clipPath id={id('clipLapPosed')}>
          <path d={SHORTS} transform={thigh} />
          <path d={THIGH} transform={thigh} />
        </clipPath>
        <clipPath id={id('clipUpperArm')}>
          <path d={UPPER_ARM} />
        </clipPath>
        <clipPath id={id('clipHand')}>
          <path d={HAND} />
        </clipPath>
      </defs>

      {/* Floor contact: chair footprint, far foot, near foot as it lands */}
      <ellipse cx="330" cy={FLOOR_Y - 6} rx="104" ry="11" fill={url('floorShadow')} />
      <ellipse cx="462" cy={FLOOR_Y - 7} rx="44" ry="6" fill={url('floorShadow')} />
      <ellipse cx={sole.x} cy={FLOOR_Y + 1} rx="40" ry="6" fill={url('floorShadow')} opacity={contact} />

      {/* Far side of the chair, in shadow */}
      {showChair && (
        <g transform={FAR_CHAIR}>
          <g fill={url('woodV')}>{chairShapes(true)}</g>
          <g fill={C.shade} opacity="0.5">
            {chairShapes(true)}
          </g>
        </g>
      )}

      {/* Far leg, resting */}
      {farLeg && (
        <g filter={url('rimSoft')}>
          <g transform={FAR_DEPTH}>
            <g transform={`rotate(${FAR_DEG} ${KNEE.x} ${KNEE.y})`}>
              <path d={SHIN_SKIN} fill={url('leg')} />
            </g>
            <g transform={FAR_FOOT_AT}>
              <path d={SOCK} fill={url('sock')} />
              <path d={SHOE} fill={url('shoe')} />
              <path d="M-16.3 -5.4C6 -6.6 38 -7 59.6 -5.4" fill="none" stroke={C.shoeLo} strokeWidth="1.2" />
              <path d="M-5 -13C8 -10 22 -11 36 -15.4" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" />
            </g>
            {farThigh(
              <>
                <path d={THIGH} fill={url('leg')} />
                <path d={SHORTS} fill={url('shorts')} />
              </>,
            )}
          </g>
          <g fill={C.shade} opacity="0.5">
            {farShapes}
          </g>
        </g>
      )}

      {/* Backrest rail, behind her back */}
      {showChair && <path d={TOP_RAIL} fill={url('woodH')} />}

      {/* Near leg, under the thigh so the knee reads as one joint */}
      <g filter={url('rim')}>
        {nearShin(
          <>
            <path d={SHIN_SKIN} fill={url('leg')} />
            <circle cx={KNEE.x} cy={KNEE.y} r={KNEE_R} fill={url('leg')} />
            <ellipse cx="468" cy="283" rx="24" ry="5" fill={C.skinHi} opacity="0.28" filter={url('soft')} />
            <path d="M456 257.6C480 259 510 260.6 540 261.4" fill="none" stroke={C.skinHi} strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
            <g transform={SHOE_AT}>
              <path d={SOCK} fill={url('sock')} />
              <path d={SHOE} fill={url('shoe')} />
              <path d="M-16.3 -5.4C6 -6.6 38 -7 59.6 -5.4" fill="none" stroke={C.shoeLo} strokeWidth="1.2" />
              <path d="M-14.2 -1.4L56 -1.4" fill="none" stroke={C.tread} strokeWidth="1.8" strokeLinecap="round" />
              <path d="M46.6 -15.6C50.4 -12 51.4 -8.6 51 -6.4" fill="none" stroke={C.shoeLo} strokeWidth="1" />
              <path d="M-5 -13C8 -10 22 -11 36 -15.4" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" />
              <path d="M-13.2 -20.2C-15.2 -16.6 -16.2 -13.4 -16.6 -10.4" fill="none" stroke={C.accent} strokeWidth="2.4" strokeLinecap="round" />
              <g stroke={C.shoeLo} strokeWidth="1.2" strokeLinecap="round">
                <path d="M6 -27.4l2.6 3.4" />
                <path d="M12 -25l2.4 3.4" />
                <path d="M18 -22.8l2.2 3.2" />
                <path d="M24 -20.8l2 3" />
              </g>
            </g>
          </>,
        )}
      </g>
      <g filter={url('rim')}>
        {/* Torso */}
        <path d={SHIRT} fill={url('shirt')} />
        <g clipPath={url('clipShirt')}>
          {/* arm's shadow on the side of the shirt */}
          <g transform="translate(-6 3)" fill={C.shirtDeep} opacity="0.55" filter={url('soft')}>
            {armShapes}
          </g>
          {/* folds gathering above the lap */}
          <g fill="none" stroke={C.shirtDeep} strokeLinecap="round" opacity="0.5" filter={url('soft')}>
            <path d="M300 236C314 232 328 232 341 236" strokeWidth="2.2" />
            <path d="M296 246C312 242 328 242 344 247" strokeWidth="2.2" />
            <path d="M337 180C333 192 333 204 336 214" strokeWidth="1.6" />
          </g>
          <path d="M286.4 108.6C296 109.8 307 111.8 318.6 112.4" fill="none" stroke={C.shirtDeep} strokeWidth="3.2" opacity="0.6" />
          <path d="M287 108.4C296.6 109.6 307.4 111.4 318.6 112" fill="none" stroke={C.shirtHi} strokeWidth="1" opacity="0.5" />
        </g>

        {/* Head */}
        <path d={HEAD} fill={url('face')} />
        <g clipPath={url('clipHead')}>
          {/* jaw shadow on the neck, cheek warmth */}
          <path d="M300 94C308 101 316 102 324 99L322 112L292 114Z" fill={C.skinDeep} opacity="0.55" filter={url('soft')} />
          <ellipse cx="318.5" cy="78" rx="7" ry="5" fill="#e0876c" opacity="0.28" filter={url('soft')} />
        </g>
        <path d={EAR} fill={C.skin} />
        <path d="M302.6 66.6C299.6 65.6 297.6 67.8 297.8 71C298 74 299.6 76.4 301.6 77.6" fill="none" stroke={C.skinLo} strokeWidth="1.3" strokeLinecap="round" />
        <path d="M317.4 58.6Q322.6 55.4 329 57.2" fill="none" stroke={C.hair} strokeWidth="1.15" strokeLinecap="round" opacity="0.8" />
        <path d={EYE} fill="#e9ddd3" />
        <g clipPath={url('clipEye')}>
          <ellipse cx="324" cy="64.2" rx="1.9" ry="2.1" fill="#3a2419" />
          <path d="M318 63.6Q322.4 61.6 326 63.4L326 64.4Q322.4 63 318 64.6Z" fill={C.skinDeep} opacity="0.45" />
        </g>
        <path d="M318.4 64.3Q322.4 61.6 326.2 63.5" fill="none" stroke={C.hair} strokeWidth="1.05" strokeLinecap="round" />
        <path d="M319.6 65.1Q322.8 66 325.4 64.6" fill="none" stroke={C.skinDeep} strokeWidth="0.5" strokeLinecap="round" opacity="0.6" />
        <path d="M331.2 74.3Q333.6 73.2 334.8 75.4" fill="none" stroke={C.skinDeep} strokeWidth="1" strokeLinecap="round" />
        <path d="M332.8 78.8C333.4 79.4 333.8 80 333.8 80.4C333 81.8 332 82.6 331.1 83C330.6 82.4 330.6 81.2 332.8 78.8Z" fill={C.lip} />
        <path d="M331.1 83C332.4 83.4 333.2 84.4 333 85.5C332.4 86.6 331.4 87.2 330.6 87.4C330 86.2 330 84.6 331.1 83Z" fill={C.lip} />

        <path d={HAIR} fill={url('hair')} />
        <path d={BUN} fill={url('hair')} />
        <g clipPath={url('clipHair')}>
          <ellipse cx="304" cy="36" rx="19" ry="5" transform="rotate(-10 304 36)" fill={C.hairHi} opacity="0.55" filter={url('softer')} />
          <ellipse cx="262" cy="58" rx="7" ry="4" fill={C.hairHi} opacity="0.5" filter={url('soft')} />
        </g>
        <g fill="none" stroke={C.hairHi} strokeLinecap="round" strokeWidth="0.7" opacity="0.4">
          <path d="M320 40C306 35 292 37 281 47" />
          <path d="M315 46C302 42 290 45 281 55" />
          <path d="M310 53C299 51 289 54 283 62" />
          <path d="M262 56C267 55.6 272 58.6 273.6 64" />
        </g>

        {/* Shorts and thigh */}
        {lap(
          <>
            <path d={THIGH} fill={url('leg')} />
            <circle cx={KNEE.x} cy={KNEE.y} r={KNEE_R} fill={url('leg')} />
            <path d={SHORTS} fill={url('shorts')} />
            <g clipPath={url('clipLap')}>
              {/* shirt hem and shorts hem cast soft shadows */}
              <path d="M279 250C300 256 326 256 346 250L346 258C326 263 300 263 279 258Z" fill={C.shade} opacity="0.45" filter={url('soft')} />
              <path d="M379 244L384 292L390 292L385 244Z" fill={C.skinDeep} opacity="0.55" filter={url('soft')} />
              {/* folds from the hip crease, side seam, hem */}
              <g fill="none" stroke={C.shortsLo} strokeLinecap="round" opacity="0.75" filter={url('soft')}>
                <path d="M350 247.4C344 252 338 258 334 265" strokeWidth="2" />
                <path d="M363 246.6C360 252 358.6 258 358.4 264" strokeWidth="1.6" />
              </g>
              <path d="M352 246C346 251 341 256 337.6 262" fill="none" stroke={C.shortsHi} strokeWidth="0.8" opacity="0.4" />
              <path d="M300 240C330 250 356 262 380 268" fill="none" stroke={C.shortsHi} strokeWidth="0.9" opacity="0.35" />
              <path d="M375.6 245.2C376.6 260 377.4 276 378.4 291" fill="none" stroke={C.shortsLo} strokeWidth="1.2" opacity="0.8" />
            </g>
          </>,
        )}
      </g>

      {/* Kneecap rides over the joint as it bends */}
      <g transform={thigh}>
        <g transform={css ? undefined : `rotate(${patella.toFixed(2)} ${KNEE.x} ${KNEE.y})`}>
          <ellipse cx={KNEE.x + 1} cy={KNEE.y - 12.5} rx="9" ry="5.5" fill={url('knee')} />
        </g>
      </g>

      {/* Near side of the chair: in front of her hips, and of her calf when it tucks under */}
      {showChair && (
        <>
          <path d={SEAT} fill={url('woodH')} />
          <path d="M270 290.2L399 290.2C403 290.4 405.8 291.6 407 293.4" fill="none" stroke={C.woodHi} strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
          <path d={APRON} fill={url('woodH')} />
          <path d={FRONT_LEG} fill={url('woodV')} />
          <path d={STRETCHER} fill={url('woodH')} />
          {/* shade under the seat, behind the rear post, which stands clear of it */}
          <rect x="268" y="299.8" width="132" height="30" fill={url('underSeat')} />
          <path d={REAR_POST} fill={url('woodV')} />
          <g fill="none" stroke={C.woodDeep} strokeWidth="0.8" opacity="0.35" strokeLinecap="round">
            <path d="M268 150C270 200 271 250 270.4 296" />
            <path d="M391 306C392 340 392 372 392 404" />
            <path d="M300 294.6C330 294 360 295 392 294.4" />
          </g>
          <path d={FRONT_LEG} fill={url('underSeat')} />
        </>
      )}

      {/* Near arm: its shadow on the lap, then hand, forearm and upper arm, each turned at its joint */}
      <g clipPath={url('clipLapPosed')}>
        <g transform="translate(-3 4)" fill={C.shade} opacity="0.45" filter={url('soft')}>
          {armShapes}
        </g>
      </g>
      <g transform={shoulderTurn}>
        <g transform={elbowTurn}>
          <path d={FOREARM} fill={url('arm')} />
          {/* crease where the forearm meets the elbow */}
          <path d={`M${at(ELBOW, 7, -9)}C${at(ELBOW, 11, -3)} ${at(ELBOW, 12.5, 4)} ${at(ELBOW, 12.6, 10)}`} fill="none" stroke={C.skinDeep} strokeWidth="1.6" strokeLinecap="round" opacity="0.3" filter={url('soft')} />
          <g transform={wristTurn}>
            <path d={HAND} fill={url('arm')} />
            <g clipPath={url('clipHand')}>
              {/* palm in shadow, a knuckle catching the light, the line between the fingers */}
              <path d={`M${at(WRIST, -12, 8)}C${at(WRIST, -8, 24)} ${at(WRIST, -5, 40)} ${at(WRIST, -2, 54)}L${at(WRIST, -12, 54)}Z`} fill={C.skinDeep} opacity="0.3" filter={url('soft')} />
              <ellipse cx={WRIST.x + 6} cy={WRIST.y + 28.5} rx="1.4" ry="2.8" fill={C.skinHi} opacity="0.6" />
              <path d={`M${at(WRIST, -1.6, 31)}C${at(WRIST, -1.6, 38)} ${at(WRIST, -2.4, 45)} ${at(WRIST, -4.4, 51)}`} fill="none" stroke={C.skinLo} strokeWidth="0.8" strokeLinecap="round" opacity="0.8" />
            </g>
          </g>
        </g>
        {/* Upper arm over the forearm, so the elbow reads as one joint */}
        <path d={UPPER_ARM} fill={url('arm')} />
        <g clipPath={url('clipUpperArm')}>
          {/* the sleeve's shadow across the arm */}
          <path d={`M${at(SHOULDER, -17, 42)}L${at(SHOULDER, 23, 42)}L${at(SHOULDER, 23, 47.5)}L${at(SHOULDER, -17, 47.5)}Z`} fill={C.skinDeep} opacity="0.35" filter={url('soft')} />
        </g>
        <path d={SLEEVE} fill={url('sleeve')} />
        <path
          d={`M${at(SHOULDER, -16.4, 40.6)}C${at(SHOULDER, -4, 43.4)} ${at(SHOULDER, 10, 43.8)} ${at(SHOULDER, 22.4, 41.6)}`}
          fill="none"
          stroke={C.shirtDeep}
          strokeWidth="2.4"
          opacity="0.5"
        />
      </g>
    </g>
  )
}

/** Cool back light: a soft bright edge along the up-and-back-facing outline,
 *  so dark hair and shorts lift off the dark stage. */
function RimLight({ id, strength }: { id: string; strength: number }) {
  return (
    <filter id={id} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
      <feOffset in="SourceAlpha" dx="2.2" dy="1.4" result="off" />
      <feComposite in="SourceAlpha" in2="off" operator="out" result="edge" />
      <feGaussianBlur in="edge" stdDeviation="0.8" result="edgeSoft" />
      <feFlood floodColor="#d6ecff" floodOpacity={strength} />
      <feComposite in2="edgeSoft" operator="in" result="rim" />
      <feMerge>
        <feMergeNode in="SourceGraphic" />
        <feMergeNode in="rim" />
      </feMerge>
    </filter>
  )
}

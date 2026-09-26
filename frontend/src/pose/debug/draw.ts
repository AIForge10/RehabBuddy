// Canvas drawing for the pose debugger: the camera overlay and the angle chart.
// Both sit on the always-dark stage, so colors are fixed rather than themed.
import { HandLandmarker, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { JointConfig } from '../joints'
import type { PoseFrame } from '../usePose'

export const COLORS = {
  // Skeleton: the person's left in blue, right in pink, so a left/right label swap is obvious.
  left: '#60a5fa',
  right: '#f472b6',
  center: '#e2e8f0',
  lowVis: '#ef4444',
  // Measured limb, same as the live session: teal until the rep counter sees a bend.
  straight: '#5eb5a6',
  bent: '#f59e0b',
  // The form check's two points once it has flagged a fault.
  fault: '#ef4444',
  // Chart series.
  final: '#4baea7',
  raw: 'rgba(255,255,255,0.5)',
  world: '#a78bfa',
  legacy: '#f87171',
}

const LEFT = new Set([1, 2, 3, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31])
const sideOf = (i: number) => (i === 0 ? 'center' : LEFT.has(i) ? 'left' : 'right')

type Px = { x: number; y: number }

export interface OverlayOptions {
  skeleton: boolean
  indices: boolean
  mirror: boolean
  minVisibility: number
  bent: boolean
  cfg: JointConfig
}

export function drawOverlay(canvas: HTMLCanvasElement | null, f: PoseFrame, o: OverlayOptions) {
  const ctx = canvas?.getContext('2d')
  if (!ctx || !canvas) return
  if (canvas.width !== f.videoWidth || canvas.height !== f.videoHeight) {
    canvas.width = f.videoWidth
    canvas.height = f.videoHeight
  }
  const W = canvas.width
  const H = canvas.height
  const k = Math.max(W, H) / 1280
  const px = (p: NormalizedLandmark): Px => ({ x: p.x * W, y: p.y * H })
  // Text is drawn unmirrored and offset to the viewer's right, whichever way the canvas is flipped.
  const dir = o.mirror ? -1 : 1
  ctx.clearRect(0, 0, W, H)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const lm = f.landmarks
  if (lm && o.skeleton) {
    for (const { start, end } of PoseLandmarker.POSE_CONNECTIONS) {
      const a = lm[start]
      const b = lm[end]
      const seen = Math.min(a.visibility ?? 0, b.visibility ?? 0) >= o.minVisibility
      const s = sideOf(start)
      ctx.strokeStyle = s === sideOf(end) ? COLORS[s] : COLORS.center
      ctx.globalAlpha = seen ? 0.85 : 0.3
      ctx.lineWidth = 3 * k
      ctx.setLineDash(seen ? [] : [6 * k, 6 * k])
      segment(ctx, px(a), px(b))
    }
    ctx.setLineDash([])
    lm.forEach((p, i) => {
      const { x, y } = px(p)
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.arc(x, y, 4.5 * k, 0, Math.PI * 2)
      if ((p.visibility ?? 0) >= o.minVisibility) {
        ctx.fillStyle = COLORS[sideOf(i)]
        ctx.fill()
      } else {
        ctx.strokeStyle = COLORS.lowVis
        ctx.lineWidth = 2 * k
        ctx.stroke()
      }
      if (o.indices) label(ctx, String(i), x + dir * 8 * k, y - 8 * k, 12 * k, o.mirror, '#fff')
    })
  }

  // The hand model's 21 points, in the side's color, where it saw a hand at a pose wrist.
  if (f.hands && o.skeleton) {
    f.hands.forEach((pts, s) => {
      if (!pts) return
      ctx.strokeStyle = COLORS[s === 0 ? 'left' : 'right']
      ctx.fillStyle = ctx.strokeStyle
      ctx.globalAlpha = 0.9
      ctx.lineWidth = 2 * k
      for (const { start, end } of HandLandmarker.HAND_CONNECTIONS) segment(ctx, px(pts[start]), px(pts[end]))
      for (const p of pts) {
        const { x, y } = px(p)
        ctx.beginPath()
        ctx.arc(x, y, 2.5 * k, 0, Math.PI * 2)
        ctx.fill()
      }
    })
  }

  // The limb auto-pick passed over, thin and dashed.
  if (f.sides && f.side && !f.held) {
    const other = f.sides[f.side === 'left' ? 1 : 0]
    const [a, j, b] = other.points.map(px)
    ctx.globalAlpha = 0.6
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2.5 * k
    ctx.setLineDash([8 * k, 6 * k])
    polyline(ctx, [a, j, b])
    ctx.setLineDash([])
    label(ctx, `${Math.round(other.angle2d)}°`, j.x + dir * 12 * k, j.y + 18 * k, 15 * k, o.mirror, 'rgba(255,255,255,0.8)')
  }

  if (f.points) {
    const [A, J, B] = f.points.map(px)
    const color = o.bent ? COLORS.bent : COLORS.straight
    ctx.globalAlpha = f.held ? 0.45 : 1
    ctx.strokeStyle = color
    ctx.lineWidth = 7 * k
    ctx.setLineDash(f.anchor === 'vertical' ? [10 * k, 8 * k] : [])
    segment(ctx, A, J)
    ctx.setLineDash([])
    segment(ctx, J, B)

    // Arc for the reading: flexion is measured from the straight-line extension of
    // the proximal segment (so a straight limb has no arc), raw from the segment itself.
    const from = o.cfg.mode === 'flexion' ? { x: J.x - A.x, y: J.y - A.y } : { x: A.x - J.x, y: A.y - J.y }
    const r = Math.min(64 * k, 0.5 * Math.min(Math.hypot(A.x - J.x, A.y - J.y), Math.hypot(B.x - J.x, B.y - J.y)))
    const a1 = Math.atan2(from.y, from.x)
    let d = Math.atan2(B.y - J.y, B.x - J.x) - a1
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    if (o.cfg.mode === 'flexion') {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 2 * k
      ctx.setLineDash([4 * k, 5 * k])
      segment(ctx, J, { x: J.x + Math.cos(a1) * r * 1.4, y: J.y + Math.sin(a1) * r * 1.4 })
      ctx.setLineDash([])
    }
    ctx.beginPath()
    ctx.moveTo(J.x, J.y)
    ctx.arc(J.x, J.y, r, a1, a1 + d, d < 0)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.globalAlpha = f.held ? 0.15 : 0.3
    ctx.fill()

    ctx.globalAlpha = f.held ? 0.45 : 1
    ctx.fillStyle = '#ffffff'
    for (const p of f.anchor === 'vertical' ? [J, B] : [A, J, B]) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 8 * k, 0, Math.PI * 2)
      ctx.fill()
    }
    if (f.angle != null) label(ctx, `${Math.round(f.angle)}°`, J.x + dir * 18 * k, J.y - 22 * k, 30 * k, o.mirror, '#fff', true)
  }

  // What the form check measures: thin and dashed while it's judging, solid red once it flags a fault.
  const form = f.form
  if (form?.points && (form.active || form.value != null)) {
    const [p, q] = form.points.map(px)
    ctx.globalAlpha = 1
    ctx.strokeStyle = form.active ? COLORS.fault : 'rgba(255,255,255,0.85)'
    ctx.lineWidth = (form.active ? 5 : 2.5) * k
    ctx.setLineDash(form.active ? [] : [6 * k, 5 * k])
    segment(ctx, p, q)
    ctx.setLineDash([])
  }
  ctx.globalAlpha = 1
}

function segment(ctx: CanvasRenderingContext2D, a: Px, b: Px) {
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
}

function polyline(ctx: CanvasRenderingContext2D, pts: Px[]) {
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  ctx.stroke()
}

function label(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, mirror: boolean, color: string, bold = false) {
  ctx.save()
  ctx.translate(x, y)
  if (mirror) ctx.scale(-1, 1)
  ctx.font = `${bold ? 700 : 600} ${size}px Figtree, ui-sans-serif, system-ui, sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = size / 4
  ctx.strokeStyle = 'rgba(0,0,0,0.65)'
  ctx.strokeText(s, 0, 0)
  ctx.fillStyle = color
  ctx.fillText(s, 0, 0)
  ctx.restore()
}

// ---------------------------------------------------------------------------

export interface ChartPoint {
  t: number
  angle: number | null
  raw: number | null
  world: number | null
  legacy: number | null
}

export interface ChartOptions {
  now: number
  windowMs: number
  cfg: JointConfig
  target: number
  show: { raw: boolean; world: boolean; legacy: boolean }
  reps: { t: number; count: number }[]
}

const MIN = -10
const MAX = 180

export function drawChart(canvas: HTMLCanvasElement | null, pts: ChartPoint[], o: ChartOptions) {
  const ctx = canvas?.getContext('2d')
  if (!ctx || !canvas) return
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const pad = { l: 36, r: 10, t: 10, b: 22 }
  const x = (t: number) => pad.l + (1 - (o.now - t) / o.windowMs) * (w - pad.l - pad.r)
  const y = (a: number) => pad.t + (1 - (Math.min(MAX, Math.max(MIN, a)) - MIN) / (MAX - MIN)) * (h - pad.t - pad.b)

  ctx.font = '500 10px "Geist Mono", ui-monospace, monospace'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 1
  for (let a = 0; a <= MAX; a += 30) {
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'
    hline(ctx, pad.l, w - pad.r, y(a))
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.textAlign = 'right'
    ctx.fillText(`${a}°`, pad.l - 6, y(a))
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  for (let s = 0; s * 1000 <= o.windowMs; s += 2) {
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillText(s ? `−${s}s` : 'now', x(o.now - s * 1000), h - 6)
  }

  const rule = (a: number, color: string, dash: number[], name: string) => {
    ctx.strokeStyle = color
    ctx.setLineDash(dash)
    hline(ctx, pad.l, w - pad.r, y(a))
    ctx.setLineDash([])
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    const tw = ctx.measureText(name).width
    ctx.fillStyle = 'rgba(5,9,8,0.85)'
    ctx.fillRect(w - pad.r - tw - 6, y(a) - 14, tw + 6, 12)
    ctx.fillStyle = color
    ctx.fillText(name, w - pad.r - 3, y(a) - 3)
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(pad.l, 0, w - pad.l - pad.r, h)
  ctx.clip()
  for (const r of o.reps) {
    if (o.now - r.t > o.windowMs) continue
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.beginPath()
    ctx.moveTo(x(r.t), pad.t)
    ctx.lineTo(x(r.t), h - pad.b)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(`#${r.count}`, x(r.t), pad.t)
  }
  if (o.show.raw) series(ctx, pts, (p) => p.raw, x, y, COLORS.raw, 1.25)
  if (o.show.legacy) series(ctx, pts, (p) => p.legacy, x, y, COLORS.legacy, 1.5, [5, 4])
  if (o.show.world) series(ctx, pts, (p) => p.world, x, y, COLORS.world, 1.5)
  series(ctx, pts, (p) => p.angle, x, y, COLORS.final, 2.5)
  ctx.restore()

  // Rep counter thresholds and the target, over the lines so the labels stay legible.
  ctx.lineWidth = 1
  rule(o.target, 'rgba(75,174,167,0.9)', [], `target ${o.target}°`)
  rule(o.cfg.bent, 'rgba(245,158,11,0.8)', [4, 4], `bent > ${o.cfg.bent}°`)
  rule(o.cfg.straight, 'rgba(255,255,255,0.5)', [4, 4], `straight < ${o.cfg.straight}°`)
}

function hline(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number) {
  ctx.beginPath()
  ctx.moveTo(x1, Math.round(y) + 0.5)
  ctx.lineTo(x2, Math.round(y) + 0.5)
  ctx.stroke()
}

function series(
  ctx: CanvasRenderingContext2D,
  pts: ChartPoint[],
  get: (p: ChartPoint) => number | null,
  x: (t: number) => number,
  y: (a: number) => number,
  color: string,
  width: number,
  dash: number[] = [],
) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineJoin = 'round'
  ctx.setLineDash(dash)
  ctx.beginPath()
  let pen = false
  for (const p of pts) {
    const v = get(p)
    if (v == null) {
      pen = false
      continue
    }
    if (pen) ctx.lineTo(x(p.t), y(v))
    else ctx.moveTo(x(p.t), y(v))
    pen = true
  }
  ctx.stroke()
  ctx.setLineDash([])
}

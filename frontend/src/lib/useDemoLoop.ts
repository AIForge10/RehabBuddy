import { useEffect, useState } from 'react'

// One perfect rep on a loop, split into the phases the briefing narrates.
// `from`/`to` are fractions of the way from the start angle to the target.
export const DEMO_PHASES = [
  { ms: 1400, from: 0, to: 0 }, // start position
  { ms: 2400, from: 0, to: 1 }, // move slowly to target
  { ms: 1000, from: 1, to: 1 }, // hold
  { ms: 2200, from: 1, to: 0 }, // return fully
] as const

const TOTAL = DEMO_PHASES.reduce((n, p) => n + p.ms, 0)
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

export interface DemoFrame {
  angle: number
  phase: number
  /** 0–1 progress through the current phase. */
  progress: number
}

export function useDemoLoop(rest: number, target: number, running = true): DemoFrame {
  const [frame, setFrame] = useState<DemoFrame>({ angle: rest, phase: 0, progress: 0 })

  useEffect(() => {
    if (!running) return
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      let t = (now - t0) % TOTAL
      let phase = 0
      while (t >= DEMO_PHASES[phase].ms) {
        t -= DEMO_PHASES[phase].ms
        phase++
      }
      const p = DEMO_PHASES[phase]
      const progress = t / p.ms
      const angle = rest + (p.from + (p.to - p.from) * ease(progress)) * (target - rest)
      setFrame({ angle, phase, progress })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [rest, target, running])

  return frame
}

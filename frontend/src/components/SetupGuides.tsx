import { useId } from 'react'
import { SeatedBody } from './SeatedBody'

// Small diagram for the camera-setup lighting check. Drawn for the dark stage:
// it sits in a glass card over the preview, or in the dark tile under the
// check on small screens.

/** Side by side: lit from the front (good) and silhouetted by a window (bad). */
export function LightGuide({ good, bad, className = '' }: { good: string; bad: string; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  // Head-to-knee crop, the framing a webcam gives.
  const crop = '236 14 300 300'
  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`}>
      <figure>
        <div className="relative overflow-hidden rounded-xl bg-white/[0.07] ring-1 ring-white/10">
          <svg viewBox={crop} className="block aspect-square w-full" aria-hidden="true">
            <defs>
              <radialGradient id={`lamp-${uid}`} cx="0.95" cy="0.1" r="0.9">
                <stop offset="0" stopColor="#ffe9c2" stopOpacity="0.28" />
                <stop offset="1" stopColor="#ffe9c2" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect x="236" y="14" width="300" height="300" fill={`url(#lamp-${uid})`} />
            <SeatedBody angle={90} farLeg={false} />
          </svg>
          <Badge good />
        </div>
        <figcaption className="mt-1.5 text-center text-xs font-semibold text-white/80">{good}</figcaption>
      </figure>
      <figure>
        <div className="relative overflow-hidden rounded-xl bg-white/[0.07] ring-1 ring-white/10">
          <svg viewBox={crop} className="block aspect-square w-full" aria-hidden="true">
            <defs>
              <radialGradient id={`window-${uid}`} cx="0.5" cy="0.5" r="0.75">
                <stop offset="0" stopColor="#fff8ea" stopOpacity="0.55" />
                <stop offset="1" stopColor="#fff8ea" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect x="236" y="14" width="300" height="300" fill={`url(#window-${uid})`} />
            <rect x="268" y="34" width="176" height="196" rx="4" fill="#fbf6ec" />
            <path d="M356 34 V230 M268 132 H444" stroke="#cfc6b6" strokeWidth="5" />
            <g className="text-[#101817]">
              <SeatedBody mode="silhouette" angle={90} farLeg={false} />
            </g>
          </svg>
          <Badge />
        </div>
        <figcaption className="mt-1.5 text-center text-xs font-semibold text-white/80">{bad}</figcaption>
      </figure>
    </div>
  )
}

function Badge({ good = false }: { good?: boolean }) {
  return (
    <span
      className={`absolute left-1.5 top-1.5 grid size-5 place-items-center rounded-full ${good ? 'bg-brand-glow text-stage' : 'bg-critical text-white'}`}
      aria-hidden="true"
    >
      <svg width="10" height="10" viewBox="0 0 12 12">
        {good ? (
          <path d="m2.5 6.2 2.2 2.1L9.5 3.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="m3.5 3.5 5 5m0-5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        )}
      </svg>
    </span>
  )
}

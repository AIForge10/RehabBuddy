import { useState } from 'react'
import { Button, PatientScreen } from '../../components/Screen'
import { SeatedBody } from '../../components/SeatedBody'
import { LightGuide } from '../../components/SetupGuides'
import { SETUP_ICONS } from '../../components/SetupIcons'
import { HIP, KNEE, ankleAt, toeAt } from '../../lib/bodyGeometry'
import { useLanguage } from '../../lib/language'
import type { CameraStatus } from '../../lib/useCamera'
import { StepHeader } from './StepHeader'

// Camera setup as one piece: the preview and the three checks share a card,
// and the next unticked check drives what the preview shows, the way the
// demo drives the steps on the briefing screen.

/** The alignment ghost lives in the demo's stage space, scaled to sit inside the frame brackets. */
const GUIDE = 'translate(360 228) scale(0.8) translate(-414 -219)'
const JOINTS = [HIP, KNEE, ankleAt(0)]
const TOE = toeAt(0)

export function Setup({
  camera,
  attach,
  onStart,
  onBack,
}: {
  camera: CameraStatus
  attach: (el: HTMLVideoElement | null) => void
  onStart: () => void
  onBack: () => void
}) {
  const { s } = useLanguage()
  const total = s.setup.length
  const [checked, setChecked] = useState<boolean[]>(() => s.setup.map(() => false))
  const count = checked.filter(Boolean).length
  const done = count === total
  const current = done ? null : checked.indexOf(false)
  const denied = camera === 'denied'

  return (
    <PatientScreen wide>
      <StepHeader step={2} title={s.setupTitle} sub={s.setupSub} />

      <section className="mt-6 grid overflow-hidden rounded-[28px] bg-surface shadow-lift ring-1 ring-line lg:grid-cols-[minmax(0,1fr)_360px]">
        <Stage camera={camera} attach={attach} step={current} />

        <div className="flex flex-col p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 px-1.5">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{s.setupChecks}</h2>
            <p aria-live="polite" className={`text-sm font-bold tabular-nums transition-colors ${done ? 'text-brand-ink' : 'text-muted'}`}>
              {s.checked(count, total)}
            </p>
          </div>
          <div className="mt-2.5 flex gap-1.5 px-1.5" aria-hidden="true">
            {checked.map((on, i) => (
              <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-track">
                <span className={`block h-full origin-left rounded-full bg-brand transition-transform duration-500 ease-out ${on ? 'scale-x-100' : 'scale-x-0'}`} />
              </span>
            ))}
          </div>

          <ol className="mt-3">
            {s.setup.map((item, i) => {
              const on = checked[i]
              const isCurrent = i === current
              return (
                <li key={item.title} className="relative">
                  <button
                    onClick={() => setChecked((c) => c.map((v, j) => (j === i ? !v : v)))}
                    aria-pressed={on}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={`relative flex w-full items-start gap-3.5 rounded-[20px] px-3 py-3 text-left transition-colors duration-300 ${
                      isCurrent ? 'bg-brand-soft' : 'hover:bg-raised'
                    }`}
                  >
                    <span
                      className={`grid size-10 shrink-0 place-items-center rounded-full transition-colors duration-300 ${
                        on
                          ? 'animate-pop bg-brand text-on-brand'
                          : isCurrent
                            ? 'bg-surface text-brand-ink ring-2 ring-brand ring-inset'
                            : 'bg-raised text-ink-2 ring-1 ring-line ring-inset'
                      }`}
                    >
                      {on ? <Check size={16} /> : SETUP_ICONS[i]}
                    </span>
                    <span className="min-w-0 flex-1 pt-0.5">
                      <span className={`block font-bold transition-colors ${isCurrent ? 'text-brand-ink' : on ? 'text-ink-2' : ''}`}>{item.title}</span>
                      <span className="block text-sm leading-snug text-ink-2">{item.body}</span>
                    </span>
                  </button>
                  {/* Rail joining the checks, filled as each is done */}
                  {i < total - 1 && (
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute -bottom-2 left-[31px] top-[56px] w-0.5 rounded-full transition-colors duration-300 ${on ? 'bg-brand' : 'bg-line-strong'}`}
                    />
                  )}
                  {/* Small screens have no room on the preview, so the lighting example opens under the check */}
                  {isCurrent && i === 2 && (
                    <div className="mb-2 ml-[54px] mr-1 mt-1 animate-rise rounded-2xl bg-stage p-3 sm:hidden">
                      <LightGuide good={s.guideLightGood} bad={s.guideLightBad} />
                    </div>
                  )}
                </li>
              )
            })}
          </ol>

          <div className="mt-auto space-y-2 pt-4">
            <Button onClick={onStart} disabled={camera === 'starting'} className="w-full">
              {denied ? s.setupCtaDemo : s.setupCta}
            </Button>
            <Button variant="ghost" size="md" onClick={onBack} className="w-full">
              {s.backToDemo}
            </Button>
          </div>
        </div>
      </section>
    </PatientScreen>
  )
}

/** Live preview with the alignment ghost, marked up for whichever check is current (null = all done). */
function Stage({ camera, attach, step }: { camera: CameraStatus; attach: (el: HTMLVideoElement | null) => void; step: number | null }) {
  const { s } = useLanguage()
  const on = camera === 'on'
  const denied = camera === 'denied'
  const done = step == null
  const shows = (i: number) => `transition-opacity duration-300 ${step === i && !denied ? 'opacity-100' : 'opacity-0'}`
  const label = { paintOrder: 'stroke', stroke: 'rgb(0 0 0 / 0.6)', strokeWidth: 6, strokeLinejoin: 'round' } as const

  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-stage sm:aspect-[16/10]">
      <video ref={attach} muted playsInline className={`absolute inset-0 h-full w-full -scale-x-100 object-cover ${on ? '' : 'invisible'}`} />
      {/* Scrim so the guides still read against a bright room */}
      <div className={`absolute inset-0 bg-gradient-to-b from-black/35 via-black/5 to-black/45 transition-opacity duration-500 ${on ? 'opacity-100' : 'opacity-0'}`} />

      <svg viewBox="0 0 720 450" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <path
          d="M60 110V60h60M600 60h60v50M660 340v50h-60M120 390H60v-50"
          fill="none"
          strokeWidth={step === 1 || done ? 5 : 3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`stroke-brand-glow transition-opacity duration-300 ${step === 1 || done ? 'opacity-100' : 'opacity-55'}`}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <svg
        viewBox="0 0 720 450"
        preserveAspectRatio="xMidYMid slice"
        className={`pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-500 ${denied ? 'opacity-30' : ''}`}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="setup-light" cx="0.92" cy="0.05" r="0.85">
            <stop offset="0" stopColor="#fff3dc" stopOpacity="0.22" />
            <stop offset="1" stopColor="#fff3dc" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* 3 · light falling on her from the camera side */}
        <rect width="720" height="450" fill="url(#setup-light)" className={shows(2)} />

        <g transform={GUIDE}>
          <g className={`transition-colors duration-500 ${done ? 'text-brand-glow' : 'text-white'} ${on ? 'opacity-85' : 'opacity-60'}`}>
            <SeatedBody mode="ghost" angle={0} />
          </g>

          {/* 1 · knee height: the camera's eye level */}
          <g className={shows(0)}>
            <line x1="-60" x2="900" y1={KNEE.y} y2={KNEE.y} className="stroke-brand-glow" strokeWidth="3" strokeDasharray="12 10" strokeLinecap="round" />
            <text x="598" y={KNEE.y - 14} fill="white" className="text-[22px] font-bold max-sm:hidden" style={label}>
              {s.guideKnee}
            </text>
          </g>

          {/* 2 · the joints the tracker has to see */}
          <g className={shows(1)}>
            <polyline
              points={[...JOINTS, TOE].map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              className="stroke-brand-glow"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {JOINTS.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="10" className="animate-ping fill-brand-glow" fillOpacity="0.35" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
                <circle cx={p.x} cy={p.y} r="8" className="fill-brand-glow" stroke="white" strokeWidth="3" />
                <text
                  x={p.x + (i === 0 ? -14 : 0)}
                  y={p.y + (i === 2 ? 42 : -22)}
                  textAnchor={i === 0 ? 'end' : 'middle'}
                  fill="white"
                  className="text-[22px] font-bold max-sm:hidden"
                  style={label}
                >
                  {s.guideJoints[i]}
                </text>
              </g>
            ))}
          </g>
        </g>
      </svg>

      <span
        role="status"
        className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/10 backdrop-blur-md sm:left-4 sm:top-4"
      >
        <span className={`size-2 rounded-full ${on ? 'bg-brand-glow' : denied ? 'bg-critical' : 'animate-pulse bg-white/60'}`} />
        {on ? s.cameraOn : denied ? s.cameraDenied.split('.')[0] : s.cameraStarting}
      </span>

      {/* Lighting is easier to show than to describe */}
      <div
        aria-hidden={step !== 2 || denied}
        className={`pointer-events-none absolute right-4 top-4 hidden w-[216px] rounded-2xl bg-black/55 p-3 ring-1 ring-white/10 backdrop-blur-md transition-[opacity,translate] duration-300 sm:block lg:w-[232px] ${
          step === 2 && !denied ? 'opacity-100' : '-translate-y-1 opacity-0'
        }`}
      >
        <LightGuide good={s.guideLightGood} bad={s.guideLightBad} />
      </div>

      {denied ? (
        <div className="absolute inset-0 grid place-items-center p-8">
          <div className="max-w-sm animate-rise rounded-3xl bg-black/55 p-6 text-center ring-1 ring-white/10 backdrop-blur-md">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/10 text-white">
              <svg width="24" height="24" viewBox="0 0 20 20" aria-hidden="true">
                <rect x="2" y="5.5" width="11" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="m13 8.5 4.5-2.5v8L13 11.5M2 3l16 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <p className="mt-3 text-[15px] leading-relaxed text-white/85">{s.cameraDenied}</p>
          </div>
        </div>
      ) : (
        <p
          key={step ?? 'done'}
          aria-hidden="true"
          className="absolute bottom-4 left-4 mr-4 hidden animate-rise items-center gap-2.5 rounded-2xl bg-black/55 py-2 pl-2 pr-4 text-white ring-1 ring-white/10 backdrop-blur-md sm:flex"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-glow text-stage [&>svg]:size-4">
            {step == null ? <Check size={14} /> : SETUP_ICONS[step]}
          </span>
          <span className="text-[15px] font-semibold leading-tight sm:text-lg">{step == null ? s.setupAllSet : s.setup[step].tip}</span>
        </p>
      )}
    </div>
  )
}

function Check({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      <path d="m2.5 6.2 2.2 2.1L9.5 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

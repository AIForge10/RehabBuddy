import { ArrowRight, buttonClass } from '../../components/Screen'
import { SeatedBody } from '../../components/SeatedBody'
import { FLOOR_Y, KNEE, ankleAt } from '../../lib/bodyGeometry'
import { exerciseFor, type Exercise } from '../../lib/exercises'
import { useLanguage } from '../../lib/language'
import type { Assignment } from '../../types/session'

const ARC_R = 58
/** Tight around the chair and the swing of the leg; the stage view leaves room for the camera overlay. */
const KNEE_CROP = { x: 200, y: 16, w: 470, h: 404 }

/** Today's exercise, shown doing the movement, and the one button that matters. */
export function NextSession({ assignment, onStart }: { assignment: Assignment; onStart: () => void }) {
  const { s, lang } = useLanguage()
  const ex = exerciseFor(assignment.exercise.joint)
  const copy = ex.copy[lang]
  // The catalog has the name in both languages; an exercise it doesn't know keeps the API's name.
  const name = ex.part === assignment.exercise.joint ? copy.name : assignment.exercise.name
  const plan = [s.chipReps(assignment.reps), copy.toTarget(assignment.target_angle), s.chipTime]

  return (
    <section
      aria-labelledby="next-session"
      className="grid animate-rise overflow-hidden rounded-3xl bg-hero text-on-hero ring-1 ring-white/6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"
    >
      <div className="flex flex-col p-6 pt-2 sm:p-10 sm:pt-4 lg:pt-10">
        <p className="label-mono flex items-center gap-2.5 text-brand-light">
          <span aria-hidden="true" className="h-px w-6 bg-current" />
          {s.today}
        </p>
        <h2 id="next-session" className="mt-4 max-w-[14ch] font-display text-[36px] leading-[1.04] sm:text-[52px]">
          {name}
        </h2>
        <ul className="mt-4 flex flex-wrap gap-x-2 text-lg text-on-hero-2">
          {plan.map((item, i) => (
            <li key={item} className="whitespace-nowrap">
              {i > 0 && (
                <span aria-hidden="true" className="mr-2 text-on-hero/30">
                  ·
                </span>
              )}
              {item}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onStart}
          className={`${buttonClass('primary')} group mt-8 w-full px-8 focus-visible:outline-brand-light sm:w-auto sm:self-start lg:mt-auto`}
        >
          {s.start}
          <ArrowRight className="transition-transform duration-200 group-hover:translate-x-1" />
        </button>
      </div>

      <Demo ex={ex} target={assignment.target_angle} />
    </section>
  )
}

/**
 * The patient's own figure doing the movement. For the knee the shin swings
 * to the prescribed angle on a slow loop, against a dashed line where it
 * should end up; other exercises hold the target pose.
 */
function Demo({ ex, target }: { ex: Exercise; target: number }) {
  const knee = ex.part === 'knee'
  const { x, y, w, h } = knee ? KNEE_CROP : ex.view
  const end = ankleAt(target)
  // A protractor arc at the knee, from straight out (0°) to the target, labelled at its middle.
  const at = (deg: number, r: number) => ({ x: KNEE.x + r * Math.cos((deg * Math.PI) / 180), y: KNEE.y + r * Math.sin((deg * Math.PI) / 180) })
  const a0 = at(0, ARC_R)
  const a1 = at(target, ARC_R)
  // Above the knee: the shin swings below it, so nothing ever crosses the number.
  const label = { x: KNEE.x + 66, y: KNEE.y - 46 }

  return (
    <div className="relative order-first px-4 pt-4 text-brand-light sm:px-8 sm:pt-6 lg:order-last lg:flex lg:items-end lg:px-10 lg:pt-8">
      <svg viewBox={`${x} ${y} ${w} ${h}`} preserveAspectRatio="xMidYMax meet" className="block h-auto max-h-[300px] w-full lg:h-[340px] lg:max-h-none" aria-hidden="true">
        <line x1={x} x2={x + w} y1={FLOOR_Y} y2={FLOOR_Y} stroke="currentColor" strokeOpacity={0.2} strokeWidth={2} />
        {knee ? <SeatedBody mode="flat" animateTo={target} /> : <SeatedBody mode="flat" pose={ex.pose(target)} />}
        {knee && (
          <g className="text-brand">
            <line x1={KNEE.x} y1={KNEE.y} x2={end.x} y2={end.y} stroke="currentColor" strokeWidth={3} strokeDasharray="2 9" strokeLinecap="round" />
            <circle cx={end.x} cy={end.y} r={6} fill="currentColor" />
            <path d={`M ${a0.x} ${a0.y} A ${ARC_R} ${ARC_R} 0 ${target > 180 ? 1 : 0} 1 ${a1.x} ${a1.y}`} fill="none" stroke="currentColor" strokeWidth={2.5} />
            <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="central" fill="currentColor" className="font-display text-[26px]">
              {target}°
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}

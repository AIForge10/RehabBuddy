// Accuracy validation on /pose-debug (the math is in validation.ts).
// CaptureBar sits under the stage: hold a pose, type what the goniometer reads,
// press Enter, and it records what the tracker read over that same second.
// ValidationResults turns the trials into the numbers for the slide.
import { useRef, useState, type ReactNode } from 'react'
import { JOINTS, type JointName } from '../joints'
import { Button, Panel, Segmented, Toggle } from './controls'
import { download, stamp } from './download'
import {
  HOLD_MS,
  STEADY_DEG,
  VARIANTS,
  errorOf,
  errorStats,
  jointLabel,
  jointsIn,
  makeTrial,
  signed,
  summaryText,
  toCsv,
  type ErrorStats,
  type HoldReading,
  type Instrument,
  type Trial,
} from './validation'

const INSTRUMENTS: { value: Instrument; label: string }[] = [
  { value: 'goniometer', label: 'Goniometer' },
  { value: 'inclinometer', label: 'Phone inclinometer' },
  { value: 'protractor', label: 'Protractor' },
]

// Landmark names for the how-to, by their left-side MediaPipe index (joints.ts lists [left, right]).
const POINT: Record<number, string> = { 11: 'shoulder', 13: 'elbow', 15: 'wrist', 19: 'index knuckle', 23: 'hip', 25: 'knee', 27: 'ankle' }

const deg1 = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1)}°`)
const lower = (s: string) => s[0].toLowerCase() + s.slice(1)

interface Feedback {
  tone: 'good' | 'warn' | 'error'
  text: string
  /** Offer "Capture anyway" for the hold that was just refused. */
  retry?: boolean
  /** The trial just saved, for Undo. */
  saved?: string
}

export function CaptureBar({
  hold,
  read,
  joint,
  angleSource,
  model,
  trials,
  onAdd,
  onDelete,
}: {
  /** The last second as of the latest UI update, for the live readout. */
  hold: HoldReading | null
  /** The last second right now, for the capture itself. */
  read: () => HoldReading
  joint: JointName
  angleSource: '2d' | '3d'
  model: string
  trials: Trial[]
  onAdd: (t: Trial) => void
  onDelete: (id: string) => void
}) {
  const [value, setValue] = useState('')
  const [instrument, setInstrument] = useState<Instrument>(() => trials.at(-1)?.instrument ?? 'goniometer')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const capture = (anyway: boolean) => {
    input.current?.focus()
    const reference = Number(value.trim().replace(',', '.'))
    if (!value.trim() || !Number.isFinite(reference)) return setFeedback({ tone: 'error', text: 'Type the angle you measured first.' })
    if (reference < -45 || reference > 225) return setFeedback({ tone: 'error', text: `${reference}° is outside any joint's range. Straight is 0°.` })
    const r = read()
    if (r.empty) return setFeedback({ tone: 'error', text: `Nothing to capture: ${lower(r.issues[0])}.` })
    if (r.issues.length && !anyway) {
      return setFeedback({ tone: 'warn', text: `Not captured: ${r.issues.map(lower).join('; ')}. Hold still and press Enter again.`, retry: true })
    }
    const t = makeTrial(r, reference, { joint, instrument, source: angleSource, model })
    if (!t) return
    onAdd(t)
    setValue('')
    setFeedback({
      tone: t.flags.length ? 'warn' : 'good',
      text: `Trial ${trials.length + 1}: app ${deg1(t.measured)} vs ${reference}°, error ${signed(t.measured - reference)}${t.flags.length ? ' (flagged)' : ''}.`,
      saved: t.id,
    })
  }

  const ready = hold != null && !hold.empty && !hold.issues.length
  const status = !hold ? 'Waiting for frames' : ready ? `Held still: moved ${hold.range!.toFixed(1)}° in ${HOLD_MS / 1000} s` : hold.issues[0]
  const name = JOINTS[joint].label.replace(' (experimental)', '').toLowerCase()

  return (
    <section className="rounded-3xl bg-surface p-4 shadow-card ring-1 ring-line">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 className="label-mono text-muted">Validation · median of the last {HOLD_MS / 1000} s</h2>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-bold leading-none tabular-nums tracking-tight">{deg1(hold?.angle)}</span>
            <span className={`flex items-center gap-1.5 text-sm font-semibold ${!hold || hold.empty ? 'text-muted' : ready ? 'text-good' : 'text-warn'}`}>
              <span className="size-2 rounded-full bg-current" />
              {status}
            </span>
          </p>
          <p className="mt-1.5 text-xs text-muted">
            {hold?.side ? (
              <>
                Measure the person’s <strong className="font-semibold text-ink-2">{hold.side} {name}</strong>
              </>
            ) : (
              `No ${name} tracked`
            )}{' '}
            · 2D {deg1(hold?.angle2d)} · 3D {deg1(hold?.angle3d)} · old {deg1(hold?.legacy)}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block text-xs font-medium text-muted">
            Reference
            <select
              value={instrument}
              onChange={(e) => setInstrument(e.target.value as Instrument)}
              className="mt-1 block h-9 rounded-xl bg-raised px-3 text-sm text-ink ring-1 ring-line"
            >
              {INSTRUMENTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-muted">
            It reads
            <span className="mt-1 flex h-9 items-center rounded-xl bg-raised pr-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-brand">
              <input
                ref={input}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="90"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    capture(false)
                  }
                }}
                className="h-full w-20 bg-transparent pl-3 text-right font-mono text-base tabular-nums text-ink outline-none placeholder:text-muted/60"
              />
              <span className="pl-0.5 font-mono text-base text-muted">°</span>
            </span>
          </label>
          <Button onClick={() => capture(false)} primary>
            Capture <kbd className="font-mono text-xs opacity-60">↵</kbd>
          </Button>
        </div>
      </div>

      {feedback && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3 text-sm" role="status">
          <p className={`mr-auto font-medium ${feedback.tone === 'good' ? 'text-good' : feedback.tone === 'warn' ? 'text-warn' : 'text-critical'}`}>{feedback.text}</p>
          {feedback.retry && <Button onClick={() => capture(true)}>Capture anyway</Button>}
          {feedback.saved && trials.some((t) => t.id === feedback.saved) && (
            <Button
              onClick={() => {
                onDelete(feedback.saved!)
                setFeedback({ tone: 'good', text: 'Removed that trial.' })
              }}
            >
              Undo
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

export function ValidationResults({ trials, onDelete, onClear }: { trials: Trial[]; onDelete: (id: string) => void; onClear: () => void }) {
  const [cleanOnly, setCleanOnly] = useState(false)
  const [scope, setScope] = useState<JointName | 'all'>('all')
  const [plot, setPlot] = useState<'scatter' | 'error'>('scatter')
  const [howTo, setHowTo] = useState(trials.length === 0)
  const [copied, setCopied] = useState(false)

  const flagged = trials.filter((t) => t.flags.length).length
  const counted = cleanOnly ? trials.filter((t) => !t.flags.length) : trials
  const joints = jointsIn(counted)
  // A scope whose trials were all deleted (or filtered out) falls back to all joints.
  const sc = scope !== 'all' && joints.includes(scope) ? scope : 'all'
  const inScope = sc === 'all' ? counted : counted.filter((t) => t.joint === sc)
  const summary = summaryText(counted)

  const variantStats = VARIANTS.map((v) => ({ ...v, stats: errorStats(inScope, v.key) }))
  const bestMae = Math.min(...variantStats.flatMap((v) => (v.stats ? [v.stats.mae] : [])))

  const copySummary = () =>
    navigator.clipboard.writeText(summary).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      },
      () => {},
    )
  const exportCsv = () => download(URL.createObjectURL(new Blob([toCsv(trials)], { type: 'text/csv' })), `pose-validation-${stamp()}.csv`)
  const clearAll = () => {
    if (confirm(`Delete all ${trials.length} trials? Export the CSV first if you still need them.`)) onClear()
  }

  return (
    <Panel
      title="Validation results"
      action={
        <span className="text-xs text-muted">
          {trials.length} {trials.length === 1 ? 'trial' : 'trials'}
          {flagged > 0 && ` · ${flagged} flagged`}
        </span>
      }
    >
      <details open={howTo} onToggle={(e) => setHowTo(e.currentTarget.open)} className="group rounded-2xl bg-raised ring-1 ring-line">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
          How to validate
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">
            <path d="m3 5 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <HowTo />
      </details>

      {trials.length === 0 ? (
        <p className="text-sm text-muted">
          No trials yet. Hold a pose, type what the goniometer reads in the Validation bar under the video, and press Enter.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            {joints.length > 1 && (
              <div className="min-w-0 flex-1 sm:max-w-md">
                <Segmented
                  label="Scope"
                  value={sc}
                  options={[{ value: 'all' as const, label: 'All joints' }, ...joints.map((j) => ({ value: j, label: jointLabel(j) }))]}
                  onChange={setScope}
                />
              </div>
            )}
            <div className="w-52">
              <Toggle label="Clean holds only" checked={cleanOnly} onChange={setCleanOnly} />
            </div>
          </div>

          {counted.length === 0 ? (
            <p className="text-sm text-muted">Every trial was flagged. Turn off “Clean holds only” to see them.</p>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 space-y-5">
                <StatsTable
                  head="Joint · final angle"
                  rows={[
                    ...joints.map((j) => ({ key: j, label: jointLabel(j), stats: errorStats(counted.filter((t) => t.joint === j)), on: sc === j })),
                    ...(joints.length > 1 ? [{ key: 'all', label: 'All joints', stats: errorStats(counted), strong: true, on: sc === 'all' }] : []),
                  ]}
                />
                <StatsTable
                  head={`Angle math · ${sc === 'all' ? 'all joints' : jointLabel(sc).toLowerCase()}`}
                  rows={variantStats.map((v) => ({
                    key: v.key,
                    label: (
                      <>
                        {v.label}
                        {v.stats && v.stats.mae === bestMae && <span className="label-mono ml-2 text-[10px] text-brand-ink">Lowest</span>}
                      </>
                    ),
                    stats: v.stats,
                  }))}
                />
                <p className="text-xs text-muted">
                  Error = app − reference, so a positive bias means the app reads more bend. 95% limits of agreement = bias ± 1.96 SD (Bland–Altman). Final is the filtered
                  angle the app shows; 2D, 3D and old math are the unfiltered readings of the same holds.
                </p>
              </div>
              <div className="min-w-0">
                <Segmented
                  label="Plot"
                  value={plot}
                  options={[
                    { value: 'scatter', label: 'App vs reference' },
                    { value: 'error', label: 'Error' },
                  ]}
                  onChange={setPlot}
                />
                <ErrorPlot trials={inScope} mode={plot} />
                <p className="mt-1 text-xs text-muted">
                  {plot === 'scatter' ? 'Diagonal: a perfect reading; band: within ±5°.' : 'Solid: bias (mean error); dashed: 95% limits of agreement.'} Hollow dots were flagged.
                </p>
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-raised p-3.5 ring-1 ring-line">
            <p className="label-mono text-[10px] text-muted">Summary{cleanOnly && flagged > 0 ? ' · clean holds only' : ''}</p>
            <p className="mt-1.5 select-all text-sm leading-relaxed text-ink-2">{summary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={copySummary} primary>
              {copied ? 'Copied' : 'Copy summary'}
            </Button>
            <Button onClick={exportCsv}>Export CSV</Button>
            <Button onClick={clearAll}>Delete all</Button>
          </div>

          <TrialsTable trials={trials} onDelete={onDelete} />
        </>
      )}
    </Panel>
  )
}

function HowTo() {
  return (
    <div className="grid gap-x-6 gap-y-4 border-t border-line p-3.5 text-sm md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <ol className="list-decimal space-y-2 pl-5 text-ink-2 marker:font-mono marker:text-xs marker:text-muted">
        <li>Pick the joint under Exercise and lock Side to the limb you’ll measure (on Auto the tracker can switch limbs mid-hold). The bar under the video names the limb it’s reading, as the person’s own left or right.</li>
        <li>Set the camera up for that joint (right). Use the model you’ll ship.</li>
        <li>
          Put the goniometer’s axis on the joint and its arms along the same points the tracker uses (right). Read it the app’s way: a straight limb is 0°, counting up as it
          bends; the shoulder is the arm’s angle away from the side of the trunk. A protractor that reads the inside angle: enter 180 minus it.
        </li>
        <li>
          Hold still, type the reading, press Enter. The app takes the median of the last {HOLD_MS / 1000} s and refuses a hold that moved more than {STEADY_DEG}° or lost the
          limb.
        </li>
        <li>Spread the reference angles over the range, like 0, 30, 60, 90 and 120° for the knee, with two or three holds each, on more than one person if you can.</li>
      </ol>
      <dl className="space-y-2">
        {(Object.keys(JOINTS) as JointName[]).map((j) => {
          const c = JOINTS[j]
          return (
            <div key={j}>
              <dt className="font-semibold text-ink">{c.label}</dt>
              <dd className="text-muted">
                {c.tip}. Arms along {POINT[c.a[0]]} · {POINT[c.joint[0]]} · {POINT[c.b[0]]}.
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}

function StatsTable({ head, rows }: { head: string; rows: { key: string; label: ReactNode; stats: ErrorStats | null; strong?: boolean; on?: boolean }[] }) {
  const num = 'px-2 py-1.5 text-right font-mono text-xs tabular-nums'
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[440px] text-sm">
        <thead>
          <tr className="label-mono text-[10px] text-muted">
            <th className="py-1.5 pr-2 text-left font-medium">{head}</th>
            <th className="px-2 py-1.5 text-right font-medium">n</th>
            <th className="px-2 py-1.5 text-right font-medium" title="Mean absolute error">
              MAE
            </th>
            <th className="px-2 py-1.5 text-right font-medium" title="Mean signed error">
              Bias
            </th>
            <th className="px-2 py-1.5 text-right font-medium" title="Largest absolute error">
              Max
            </th>
            <th className="py-1.5 pl-2 text-right font-medium">95% limits</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={`border-t ${r.strong ? 'border-line-strong' : 'border-line'} ${r.on ? 'bg-brand-soft' : ''}`}>
              <td className={`py-1.5 pr-2 ${r.strong ? 'font-semibold' : ''}`}>{r.label}</td>
              <td className={num}>{r.stats?.n ?? 0}</td>
              <td className={`${num} font-semibold text-ink`}>{r.stats ? `${r.stats.mae.toFixed(1)}°` : '—'}</td>
              <td className={num}>{r.stats ? signed(r.stats.bias) : '—'}</td>
              <td className={num}>{r.stats ? `${r.stats.max.toFixed(1)}°` : '—'}</td>
              <td className={`${num} pr-0`}>{r.stats?.loa ? `${signed(r.stats.loa[0])} to ${signed(r.stats.loa[1])}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TrialsTable({ trials, onDelete }: { trials: Trial[]; onDelete: (id: string) => void }) {
  const num = 'px-2 py-1.5 text-right font-mono text-xs tabular-nums'
  const err = (t: Trial, v: 'measured' | 'angle2d' | 'angle3d' | 'legacy') => {
    const e = errorOf(t, v)
    return e == null ? '—' : signed(e)
  }
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="label-mono text-[10px] text-muted">
            <th className="py-1.5 pr-2 text-left font-medium">#</th>
            <th className="px-2 py-1.5 text-left font-medium">Limb</th>
            <th className="px-2 py-1.5 text-right font-medium">Reference</th>
            <th className="px-2 py-1.5 text-right font-medium">App</th>
            <th className="px-2 py-1.5 text-right font-medium">Error</th>
            <th className="px-2 py-1.5 text-right font-medium">2D err</th>
            <th className="px-2 py-1.5 text-right font-medium">3D err</th>
            <th className="px-2 py-1.5 text-right font-medium">Old err</th>
            <th className="px-2 py-1.5 text-right font-medium" title="Max − min of the filtered angle over the hold">
              Moved
            </th>
            <th className="px-2 py-1.5 text-right font-medium" title="Lowest visibility of the three points over the hold">
              Vis.
            </th>
            <th className="px-2 py-1.5 text-left font-medium">Flag</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {trials
            .map((t, i) => ({ t, n: i + 1 }))
            .reverse()
            .map(({ t, n }) => (
              <tr key={t.id} className="border-t border-line">
                <td className="py-1.5 pr-2 font-mono text-xs text-muted">{n}</td>
                <td className="px-2 py-1.5 capitalize" title={`${t.instrument} · ${t.source.toUpperCase()} · ${t.model} model · ${new Date(t.at).toLocaleString()}`}>
                  {t.side} {t.joint}
                </td>
                <td className={num}>{deg1(t.reference)}</td>
                <td className={num}>{deg1(t.measured)}</td>
                <td className={`${num} font-semibold text-ink`}>{err(t, 'measured')}</td>
                <td className={`${num} text-muted`}>{err(t, 'angle2d')}</td>
                <td className={`${num} text-muted`}>{err(t, 'angle3d')}</td>
                <td className={`${num} text-muted`}>{err(t, 'legacy')}</td>
                <td className={num}>{deg1(t.range)}</td>
                <td className={num}>{t.confidence.toFixed(2)}</td>
                <td className="max-w-56 truncate px-2 py-1.5 text-xs text-warn" title={t.flags.join('; ')}>
                  {t.flags.join('; ')}
                </td>
                <td className="py-1 text-right">
                  <button
                    type="button"
                    onClick={() => onDelete(t.id)}
                    aria-label={`Delete trial ${n}`}
                    className="grid size-7 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-critical"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="m2.5 2.5 7 7m0-7-7 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Reference on x. 'scatter': the app's reading on y, against the diagonal a
 * perfect reading would sit on. 'error': app − reference on y with the bias and
 * 95% limits of agreement (Bland–Altman, plotted against the reference, the gold
 * standard here, rather than the mean of the two).
 */
function ErrorPlot({ trials, mode }: { trials: Trial[]; mode: 'scatter' | 'error' }) {
  const W = 320
  const H = 290
  // The error plot labels its three rules in the right margin, clear of the dots.
  const pad = { l: 42, r: mode === 'error' ? 44 : 12, t: 12, b: 40 }
  const stats = errorStats(trials)
  const errors = trials.map((t) => t.measured - t.reference)
  const span = mode === 'scatter' ? [...trials.map((t) => t.reference), ...trials.map((t) => t.measured)] : trials.map((t) => t.reference)
  const lo = Math.min(0, Math.floor(Math.min(...span) / 30) * 30)
  const hi = Math.max(90, Math.ceil(Math.max(...span) / 30) * 30)
  const lim = Math.max(10, Math.ceil(Math.max(...errors.map(Math.abs), ...(stats?.loa ?? []).map(Math.abs)) / 5) * 5)
  const [yLo, yHi] = mode === 'scatter' ? [lo, hi] : [-lim, lim]
  // Inset from the frame, so dots at 0° or on the top tick aren't cut in half by it.
  const inset = 8
  const x = (v: number) => pad.l + inset + ((v - lo) / (hi - lo)) * (W - pad.l - pad.r - 2 * inset)
  const y = (v: number) => pad.t + inset + (1 - (v - yLo) / (yHi - yLo)) * (H - pad.t - pad.b - 2 * inset)
  const xTicks = ticks(lo, hi, hi - lo > 150 ? 60 : 30)
  const yTicks = mode === 'scatter' ? xTicks : ticks(-lim, lim, lim > 20 ? 10 : 5)
  const band = [
    [lo, lo],
    [lo, lo + 5],
    [hi - 5, hi],
    [hi, hi],
    [hi, hi - 5],
    [lo + 5, lo],
  ]
  const tick = 'fill-muted font-mono text-[10px]'
  // Bias and the two limits, top to bottom; labels pushed at least a line apart when the limits are tight.
  const rules = stats
    ? [
        ...(stats.loa ? [{ v: stats.loa[1], bias: false }] : []),
        { v: stats.bias, bias: true },
        ...(stats.loa ? [{ v: stats.loa[0], bias: false }] : []),
      ].map((r) => ({ ...r, at: y(r.v) }))
    : []
  for (let i = 1; i < rules.length; i++) rules[i].at = Math.max(rules[i].at, rules[i - 1].at + 11)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-3 block h-auto w-full max-w-[360px]"
      role="img"
      aria-label={mode === 'scatter' ? `App angle against reference angle, ${trials.length} trials` : `Error against reference angle, ${trials.length} trials`}
    >
      {xTicks.map((v) => (
        <g key={`x${v}`}>
          <line x1={x(v)} x2={x(v)} y1={pad.t} y2={H - pad.b} className="stroke-line" />
          <text x={x(v)} y={H - pad.b + 14} textAnchor="middle" className={tick}>
            {v}°
          </text>
        </g>
      ))}
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className={v === 0 && mode === 'error' ? 'stroke-line-strong' : 'stroke-line'} />
          <text x={pad.l - 6} y={y(v) + 3.5} textAnchor="end" className={tick}>
            {mode === 'error' && v > 0 ? '+' : ''}
            {v}°
          </text>
        </g>
      ))}

      {mode === 'scatter' ? (
        <>
          <polygon points={band.map(([a, b]) => `${x(a)},${y(b)}`).join(' ')} className="fill-brand-soft" />
          <line x1={x(lo)} y1={y(lo)} x2={x(hi)} y2={y(hi)} className="stroke-brand-ink" strokeWidth={1} strokeDasharray="4 3" />
        </>
      ) : (
        rules.map((r) => (
          <g key={r.bias ? 'bias' : r.v}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(r.v)}
              y2={y(r.v)}
              className={r.bias ? 'stroke-brand-ink' : 'stroke-ink-2'}
              strokeWidth={r.bias ? 1.5 : 1}
              strokeDasharray={r.bias ? undefined : '4 4'}
            />
            <text x={W - pad.r + 5} y={r.at + 3.5} className={`font-mono text-[10px] ${r.bias ? 'fill-ink font-semibold' : 'fill-muted'}`}>
              {signed(r.v)}
            </text>
          </g>
        ))
      )}

      {trials.map((t) => {
        const cx = x(t.reference)
        const cy = y(mode === 'scatter' ? t.measured : t.measured - t.reference)
        const flag = t.flags.length > 0
        return (
          <g key={t.id}>
            <title>
              {`${t.side ?? ''} ${t.joint}: ${t.instrument} ${deg1(t.reference)}, app ${deg1(t.measured)} (${signed(t.measured - t.reference)})${flag ? `. Flagged: ${t.flags.join('; ')}` : ''}`}
            </title>
            <circle cx={cx} cy={cy} r={9} fill="transparent" />
            <circle cx={cx} cy={cy} r={4} className={flag ? 'fill-surface stroke-brand-ink' : 'fill-brand-ink stroke-surface'} strokeWidth={flag ? 1.5 : 2} />
          </g>
        )
      })}

      <text x={pad.l + (W - pad.l - pad.r) / 2} y={H - 6} textAnchor="middle" className="fill-muted text-[11px]">
        Reference angle
      </text>
      <text transform={`translate(11 ${pad.t + (H - pad.t - pad.b) / 2}) rotate(-90)`} textAnchor="middle" className="fill-muted text-[11px]">
        {mode === 'scatter' ? 'App angle' : 'App − reference'}
      </text>
    </svg>
  )
}

function ticks(from: number, to: number, step: number) {
  const out: number[] = []
  for (let v = Math.ceil(from / step) * step; v <= to; v += step) out.push(v)
  return out
}

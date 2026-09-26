import { useEffect, useRef, useState } from 'react'
import { DEMO_THERAPIST_ID, USE_MOCKS, getDashboard, getSummary } from '../api/client'
import { resetMockData } from '../api/mock'
import { RomChart } from '../components/RomChart'
import { Wordmark } from '../components/Wordmark'
import { formatDuration, shortDate, timeAgo } from '../lib/format'
import type { DashboardResponse, PatientOverview, RedFlag } from '../types/session'

const POLL_MS = 3000
const FLAG_WINDOW_MS = 3 * 86_400_000
const HIGHLIGHT_MS = 6000

const recentFlags = (p: PatientOverview, now: number): RedFlag[] =>
  p.red_flags.filter((f) => now - Date.parse(f.created_at) < FLAG_WINDOW_MS)

export default function TherapistDashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [error, setError] = useState(false)
  const [lastOk, setLastOk] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [fresh, setFresh] = useState<Record<string, number>>({}) // session id → highlight-until
  const seen = useRef<Set<string> | null>(null)

  // Poll for the live-update effect; pause while the tab is hidden.
  useEffect(() => {
    let alive = true
    const load = async () => {
      if (document.hidden && seen.current) return
      try {
        const res = await getDashboard(DEMO_THERAPIST_ID)
        if (!alive) return
        const ids = res.patients.flatMap((p) => p.sessions.map((s) => ({ id: s.id, patient: p.patient.id })))
        if (seen.current) {
          const added = ids.filter((x) => !seen.current!.has(x.id))
          if (added.length) {
            const until = Date.now() + HIGHLIGHT_MS
            setFresh((f) => ({ ...f, ...Object.fromEntries(added.map((x) => [x.id, until])) }))
            setSelectedId(added[added.length - 1].patient)
          }
        }
        seen.current = new Set(ids.map((x) => x.id))
        setData(res)
        setError(false)
        setLastOk(Date.now())
      } catch {
        if (alive) setError(true)
      }
    }
    load()
    const id = setInterval(load, POLL_MS)
    const onVisible = () => !document.hidden && load()
    document.addEventListener('visibilitychange', onVisible)
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      alive = false
      clearInterval(id)
      clearInterval(clock)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const patients = data?.patients ?? []
  const selected = patients.find((p) => p.patient.id === selectedId) ?? patients[0]
  const alerts = patients.flatMap((p) => recentFlags(p, now).map((f) => ({ ...f, name: p.patient.full_name })))
  alerts.sort((a, b) => b.created_at.localeCompare(a.created_at))

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-4">
            <Wordmark to="/therapist" />
            <span className="text-sm text-muted">Dr. Lee · Knee rehab caseload</span>
          </div>
          <LiveIndicator error={error} lastOk={lastOk} now={now} />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-6">
        {alerts.length > 0 && (
          <section aria-label="Red flags" className="mb-6 rounded-xl border border-critical/30 bg-critical-soft">
            {alerts.map((a) => (
              <button
                key={a.session_id}
                onClick={() => setSelectedId(a.patient_id)}
                className="flex w-full items-center gap-3 border-b border-critical/15 px-4 py-3 text-left last:border-0 hover:bg-critical/5"
              >
                <FlagIcon />
                <span className="text-sm">
                  <span className="font-semibold text-critical">{a.name}</span>
                  <span className="text-ink"> reported pain {a.pain_score}/10</span>
                  <span className="text-ink-2"> · {a.reason}</span>
                </span>
                <span className="ml-auto shrink-0 text-xs text-ink-2">{timeAgo(a.created_at, now)}</span>
              </button>
            ))}
          </section>
        )}

        {!data && !error && <p className="text-muted">Loading patients…</p>}
        {!data && error && <p className="text-critical">Can’t reach the backend. Retrying every few seconds.</p>}

        {data && (
          <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
            <PatientList patients={patients} selectedId={selected?.patient.id} onSelect={setSelectedId} now={now} />
            {selected && <PatientDetail key={selected.patient.id} p={selected} fresh={fresh} now={now} />}
          </div>
        )}

        {USE_MOCKS && (
          <p className="mt-10 text-xs text-muted">
            Mock data.{' '}
            <button
              className="underline underline-offset-2 hover:text-ink"
              onClick={() => {
                resetMockData()
                location.reload()
              }}
            >
              Reset demo data
            </button>
          </p>
        )}
      </main>
    </div>
  )
}

function LiveIndicator({ error, lastOk, now }: { error: boolean; lastOk: number | null; now: number }) {
  const secs = lastOk ? Math.max(0, Math.round((now - lastOk) / 1000)) : null
  return (
    <span className="flex items-center gap-2 text-xs text-ink-2">
      <span className="relative flex size-2">
        {!error && <span className="absolute inset-0 animate-ping rounded-full bg-good opacity-60" />}
        <span className={`relative size-2 rounded-full ${error ? 'bg-critical' : 'bg-good'}`} />
      </span>
      {error ? 'Reconnecting…' : 'Live'}
      {secs != null && <span className="tabular-nums text-muted">· updated {secs}s ago</span>}
    </span>
  )
}

function FlagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-critical">
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path d="M8 4.5v4.2M8 11v.3" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function AdherenceMeter({ value }: { value: number }) {
  const pct = Math.min(1, value) * 100
  const low = value < 0.6
  return (
    <span className={`block h-1 w-16 overflow-hidden rounded-full ${low ? 'bg-warn-soft' : 'bg-accent-soft'}`}>
      <span className={`block h-full rounded-full ${low ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
    </span>
  )
}

function PatientList({
  patients,
  selectedId,
  onSelect,
  now,
}: {
  patients: PatientOverview[]
  selectedId?: string
  onSelect: (id: string) => void
  now: number
}) {
  return (
    <section aria-label="Patients" className="self-start overflow-hidden rounded-2xl border border-line bg-surface">
      <p className="border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">
        Patients · {patients.length}
      </p>
      <ul>
        {patients.map((p) => {
          const done = Math.round(p.adherence_7d * p.assignment.times_per_week)
          const last = p.sessions[0]
          const flags = recentFlags(p, now)
          const active = p.patient.id === selectedId
          return (
            <li key={p.patient.id} className="border-b border-line last:border-0">
              <button
                onClick={() => onSelect(p.patient.id)}
                aria-current={active}
                className={`relative flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors ${
                  active ? 'bg-canvas' : 'hover:bg-canvas/60'
                }`}
              >
                {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold">{p.patient.full_name}</span>
                    {flags.length > 0 && (
                      <span className="rounded-full bg-critical-soft px-2 py-0.5 text-[11px] font-semibold text-critical">
                        Pain {flags[flags.length - 1].pain_score}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-sm text-ink-2">{p.patient.injury}</span>
                  <span className="mt-1 block text-xs text-muted">{last ? `Last session ${timeAgo(last.started_at, now)}` : 'No sessions yet'}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
                  <span className="text-sm tabular-nums">
                    <span className="font-semibold">{done}</span>
                    <span className="text-muted">/{p.assignment.times_per_week} this wk</span>
                  </span>
                  <AdherenceMeter value={p.adherence_7d} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'critical' | 'accent' }) {
  return (
    <div className="p-4">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold tracking-tight ${tone === 'critical' ? 'text-critical' : tone === 'accent' ? 'text-accent' : ''}`}>
        {value}
      </dd>
      {sub && <dd className="mt-0.5 text-xs text-muted">{sub}</dd>}
    </div>
  )
}

function PatientDetail({ p, fresh, now }: { p: PatientOverview; fresh: Record<string, number>; now: number }) {
  const { patient, assignment, sessions } = p
  const [summary, setSummary] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)

  const chronological = [...sessions].reverse()
  const first = chronological[0]
  const latest = sessions[0]
  const done = Math.round(p.adherence_7d * assignment.times_per_week)
  const gain = latest && first ? latest.max_angle - first.max_angle : 0
  const latestPain = sessions.find((s) => s.pain_score != null)

  async function regenerate() {
    setRegenerating(true)
    const res = await getSummary(patient.id)
    setSummary(res.summary_text)
    setRegenerating(false)
  }

  return (
    <section aria-label={patient.full_name} className="min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{patient.full_name}</h1>
        <p className="mt-1 text-sm text-ink-2">
          {patient.injury} · since {shortDate(patient.start_date)} · {assignment.exercise.name}, {assignment.reps} reps to{' '}
          {assignment.target_angle}°, {assignment.times_per_week}×/week · {patient.language === 'es' ? 'Spanish' : 'English'}
        </p>
      </div>

      <dl className="grid grid-cols-2 divide-line rounded-2xl border border-line bg-surface sm:grid-cols-4 sm:divide-x">
        <Stat
          label="Latest peak flexion"
          value={latest ? `${latest.max_angle}°` : '—'}
          sub={latest ? `${gain >= 0 ? '+' : ''}${gain}° since first session` : undefined}
          tone={latest && latest.max_angle >= assignment.target_angle ? 'accent' : undefined}
        />
        <Stat label="Adherence, last 7 days" value={`${done} of ${assignment.times_per_week}`} sub={`${Math.round(p.adherence_7d * 100)}% of plan`} />
        <Stat label="Sessions logged" value={`${sessions.length}`} sub={latest ? `last ${timeAgo(latest.started_at, now)}` : undefined} />
        <Stat
          label="Latest pain"
          value={latestPain?.pain_score != null ? `${latestPain.pain_score}/10` : '—'}
          sub={latestPain?.flagged ? 'Flagged for review' : latestPain ? 'Within expected range' : undefined}
          tone={latestPain?.flagged ? 'critical' : undefined}
        />
      </dl>

      <div className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Peak knee flexion per session</h2>
        <p className="text-sm text-muted">Degrees of bend, higher is better</p>
        <div className="mt-4">{sessions.length ? <RomChart sessions={sessions} target={assignment.target_angle} /> : <p className="text-muted">No sessions yet.</p>}</div>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-semibold">Weekly summary</h2>
          <button onClick={regenerate} disabled={regenerating} className="text-sm text-accent hover:text-accent-strong disabled:text-muted">
            {regenerating ? 'Writing…' : 'Regenerate'}
          </button>
        </div>
        <blockquote className="mt-3 border-l-2 border-accent pl-4 leading-relaxed text-ink">
          {summary ?? p.latest_summary ?? 'No summary yet.'}
        </blockquote>
        <p className="mt-3 text-xs text-muted">Written by Gemini from session data. Review before acting.</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <h2 className="px-5 pb-3 pt-5 font-semibold">Sessions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-y border-line text-left text-xs text-muted">
                <th className="px-5 py-2 font-medium">Date</th>
                <th className="px-3 py-2 text-right font-medium">Reps</th>
                <th className="px-3 py-2 text-right font-medium">Peak</th>
                <th className="px-3 py-2 text-right font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Form</th>
                <th className="px-5 py-2 text-right font-medium">Pain</th>
              </tr>
            </thead>
            <tbody>
              {sessions.slice(0, 10).map((s) => {
                const isFresh = (fresh[s.id] ?? 0) > now
                return (
                  <tr key={s.id} className={`border-b border-line transition-colors duration-1000 last:border-0 ${isFresh ? 'bg-accent-soft' : ''}`}>
                    <td className="whitespace-nowrap px-5 py-2.5">
                      {new Date(s.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      {isFresh && <span className="ml-2 text-xs font-semibold text-accent">New</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {s.reps_done}
                      <span className="text-muted">/{assignment.reps}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium">{s.max_angle}°</td>
                    <td className="px-3 py-2.5 text-right text-ink-2">{formatDuration(s.duration_sec)}</td>
                    <td className="px-3 py-2.5 text-ink-2">{s.form_warnings.length ? [...new Set(s.form_warnings)].join(', ') : '—'}</td>
                    <td className={`px-5 py-2.5 text-right ${s.flagged ? 'font-semibold text-critical' : ''}`}>
                      {s.pain_score ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

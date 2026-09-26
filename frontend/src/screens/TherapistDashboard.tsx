import { useEffect, useRef, useState } from 'react'
import { USE_MOCKS, getDashboard, getSummary } from '../api/client'
import { resetMockData } from '../api/mock'
import { AccountMenu } from '../components/AccountMenu'
import { Logo } from '../components/Logo'
import { RomChart } from '../components/RomChart'
import { TITLE, buttonClass } from '../components/Screen'
import { useAuth } from '../lib/auth'
import { formatDuration, shortDate, timeAgo } from '../lib/format'
import type { DashboardResponse, PatientOverview, RedFlag } from '../types/session'

const POLL_MS = 3000
const DAY_MS = 86_400_000
const FLAG_WINDOW_MS = 3 * DAY_MS
const HIGHLIGHT_MS = 8000

const recentFlags = (p: PatientOverview, now: number): RedFlag[] =>
  p.red_flags.filter((f) => now - Date.parse(f.created_at) < FLAG_WINDOW_MS)

const initials = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function TherapistDashboard() {
  const { account } = useAuth()
  const therapistId = account!.id // RequireAuth only renders this screen signed in
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
        const res = await getDashboard(therapistId)
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
  }, [therapistId])

  const patients = data?.patients ?? []
  const selected = patients.find((p) => p.patient.id === selectedId) ?? patients[0]
  const alerts = patients
    .flatMap((p) => recentFlags(p, now).map((f) => ({ ...f, name: p.patient.full_name })))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const needAttention = new Set(alerts.map((a) => a.patient_id)).size
  const weekSessions = patients.reduce((n, p) => n + Math.round(p.adherence_7d * p.assignment.times_per_week), 0)

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-3 px-5">
          <Logo to="/therapist" suffix="Clinic" />
          <div className="flex items-center gap-4">
            <LiveIndicator error={error} lastOk={lastOk} now={now} />
            <AccountMenu english />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 pb-16 pt-8">
        <div className="animate-rise">
          <p className="label-mono text-muted">{new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 className={`mt-3 ${TITLE}`}>
            {greeting()}, {account?.full_name ?? 'Dr. Lee'}
          </h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-2.5 text-lg text-ink-2">
            <span>
              <span className="font-bold text-ink tabular-nums">{patients.length}</span> patients
            </span>
            {needAttention > 0 && (
              <>
                <span aria-hidden="true" className="text-line-strong">·</span>
                <span className="font-semibold text-critical">
                  <span className="font-bold tabular-nums">{needAttention}</span> {needAttention === 1 ? 'needs' : 'need'} attention
                </span>
              </>
            )}
            <span aria-hidden="true" className="text-line-strong">·</span>
            <span>
              <span className="font-bold text-ink tabular-nums">{weekSessions}</span> sessions this week
            </span>
          </p>
        </div>

        {alerts.length > 0 && (
          <section aria-label="Red flags" className="mt-8 animate-rise overflow-hidden rounded-2xl bg-critical-soft ring-1 ring-critical/25">
            {alerts.map((a) => (
              <button
                key={a.session_id}
                onClick={() => setSelectedId(a.patient_id)}
                className="flex w-full items-center gap-3 border-b border-critical/15 px-5 py-3.5 text-left transition-colors last:border-0 hover:bg-critical/5"
              >
                <FlagIcon />
                <span className="min-w-0 flex-1 text-[15px]">
                  <span className="font-bold text-critical">{a.name}</span>
                  <span className="text-ink"> reported pain {a.pain_score}/10</span>
                  <span className="text-ink-2"> · {a.reason}</span>
                </span>
                <span className="label-mono shrink-0 text-ink-2">{timeAgo(a.created_at, now)}</span>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-ink-2">
                  <path d="m6 3.5 4.5 4.5L6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </section>
        )}

        {!data && !error && (
          <div className="mt-8 grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
            <div className="h-72 animate-pulse rounded-3xl bg-line" />
            <div className="h-[560px] animate-pulse rounded-3xl bg-line" />
          </div>
        )}
        {!data && error && <p className="mt-6 text-critical">Can’t reach the backend. Retrying every few seconds.</p>}

        {data && (
          <div className="mt-8 grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)] xl:gap-8">
            <PatientList patients={patients} selectedId={selected?.patient.id} onSelect={setSelectedId} now={now} fresh={fresh} />
            {selected && <PatientDetail key={selected.patient.id} p={selected} fresh={fresh} now={now} />}
          </div>
        )}

        {USE_MOCKS && (
          <p className="label-mono mt-14 text-muted">
            Demo data ·{' '}
            <button
              className="underline underline-offset-2 hover:text-ink"
              onClick={() => {
                resetMockData()
                location.reload()
              }}
            >
              Reset
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
    <span className="label-mono hidden h-9 items-center gap-2 rounded-full bg-surface px-3.5 text-ink-2 ring-1 ring-line sm:inline-flex">
      <span className="relative flex size-2">
        {!error && <span className="absolute inset-0 animate-ping rounded-full bg-brand opacity-70" />}
        <span className={`relative size-2 rounded-full ${error ? 'bg-critical' : 'bg-brand'}`} />
      </span>
      {error ? 'Reconnecting…' : 'Live'}
      {secs != null && !error && <span className="tabular-nums text-muted">· {secs}s ago</span>}
    </span>
  )
}

function FlagIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-critical">
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path d="M8 4.5v4.2M8 11v.3" className="stroke-critical-soft" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function Avatar({ name, size = 40, flagged = false }: { name: string; size?: number; flagged?: boolean }) {
  return (
    <span className="relative inline-grid shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-brand-ink" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials(name)}
      {flagged && <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-critical ring-2 ring-surface" />}
    </span>
  )
}

/** Small donut: sessions done this week vs plan. */
function AdherenceRing({ done, plan }: { done: number; plan: number }) {
  const r = 18
  const circ = 2 * Math.PI * r
  const pct = Math.min(1, done / plan)
  const low = pct < 0.6
  return (
    <span className="relative grid size-11 shrink-0 place-items-center" title={`${done} of ${plan} sessions this week`}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" className={low ? 'stroke-warn-soft' : 'stroke-brand-track'} strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          className={`transition-[stroke-dashoffset] duration-700 ${low ? 'stroke-warn' : 'stroke-brand'}`}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
        />
      </svg>
      <span className="text-xs font-bold tracking-tight tabular-nums">
        {done}/{plan}
      </span>
    </span>
  )
}

function PatientList({
  patients,
  selectedId,
  onSelect,
  now,
  fresh,
}: {
  patients: PatientOverview[]
  selectedId?: string
  onSelect: (id: string) => void
  now: number
  fresh: Record<string, number>
}) {
  return (
    <section aria-label="Patients" className="overflow-hidden rounded-3xl bg-surface ring-1 ring-line lg:sticky lg:top-24">
      <p className="label-mono px-5 pb-2 pt-5 text-muted">Patients · {patients.length}</p>
      <ul className="p-2 pt-0">
        {patients.map((p) => {
          const done = Math.round(p.adherence_7d * p.assignment.times_per_week)
          const last = p.sessions[0]
          const flagged = recentFlags(p, now).length > 0
          const active = p.patient.id === selectedId
          const isNew = last && (fresh[last.id] ?? 0) > now
          return (
            <li key={p.patient.id}>
              <button
                onClick={() => onSelect(p.patient.id)}
                aria-current={active}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${
                  active ? 'bg-brand-soft' : 'hover:bg-raised'
                }`}
              >
                <Avatar name={p.patient.full_name} flagged={flagged} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{p.patient.full_name}</span>
                  <span className={`block truncate text-sm ${isNew ? 'font-bold text-brand-ink' : 'text-ink-2'}`}>
                    {isNew ? 'New session just now' : last ? `Last session ${timeAgo(last.started_at, now)}` : 'No sessions yet'}
                  </span>
                </span>
                <AdherenceRing done={done} plan={p.assignment.times_per_week} />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'critical' | 'brand' }) {
  return (
    <div className="p-5">
      <dt className="label-mono text-muted">{label}</dt>
      <dd className={`mt-3 text-[32px] font-bold leading-none tracking-tight tabular-nums ${tone === 'critical' ? 'text-critical' : tone === 'brand' ? 'text-brand-ink' : ''}`}>
        {value}
      </dd>
      {sub && <dd className="mt-2 text-[13px] text-ink-2">{sub}</dd>}
    </div>
  )
}

function PatientDetail({ p, fresh, now }: { p: PatientOverview; fresh: Record<string, number>; now: number }) {
  const { patient, assignment, sessions } = p
  const [summary, setSummary] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)

  const first = sessions.at(-1)
  const latest = sessions[0]
  const done = Math.round(p.adherence_7d * assignment.times_per_week)
  const gain = latest && first ? latest.max_angle - first.max_angle : 0
  const latestPain = sessions.find((s) => s.pain_score != null)
  const rehabDay = Math.max(1, Math.round((now - Date.parse(patient.start_date)) / DAY_MS))
  const flagged = recentFlags(p, now).length > 0

  async function regenerate() {
    setRegenerating(true)
    const res = await getSummary(patient.id)
    setSummary(res.summary_text)
    setRegenerating(false)
  }

  return (
    <section aria-label={patient.full_name} className="min-w-0 animate-rise space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={patient.full_name} size={56} flagged={flagged} />
          <div className="min-w-0">
            <h2 className="truncate font-display text-[30px] leading-tight">{patient.full_name}</h2>
            <p className="label-mono mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-muted">
              <span>{patient.injury}</span>
              <span aria-hidden="true">·</span>
              <span>Day {rehabDay} of rehab</span>
              <span aria-hidden="true">·</span>
              <span>{patient.language === 'es' ? 'Spanish' : 'English'}</span>
            </p>
          </div>
        </div>
        <div className="text-right max-sm:text-left">
          <p className="label-mono text-muted">Plan</p>
          <p className="mt-1 text-[15px] text-ink-2">
            <span className="font-bold text-ink">{assignment.exercise.name}</span> · {assignment.reps} × {assignment.target_angle}° · {assignment.times_per_week}×/wk
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 overflow-hidden rounded-3xl bg-surface ring-1 ring-line sm:grid-cols-4 [&>div]:border-line max-sm:[&>div:nth-child(-n+2)]:border-b sm:[&>div:not(:first-child)]:border-l max-sm:[&>div:nth-child(2n)]:border-l">
        <Stat
          label="Peak flexion"
          value={latest ? `${latest.max_angle}°` : '—'}
          sub={latest ? `${gain >= 0 ? '+' : ''}${gain}° since first session` : undefined}
          tone={latest && latest.max_angle >= assignment.target_angle ? 'brand' : undefined}
        />
        <Stat label="Adherence, 7d" value={`${done}/${assignment.times_per_week}`} sub={`${Math.round(p.adherence_7d * 100)}% of plan`} />
        <Stat label="Sessions" value={`${sessions.length}`} sub={latest ? `Last ${timeAgo(latest.started_at, now)}` : undefined} />
        <Stat
          label="Latest pain"
          value={latestPain?.pain_score != null ? `${latestPain.pain_score}/10` : '—'}
          sub={latestPain?.flagged ? 'Flagged for review' : latestPain ? 'Expected range' : undefined}
          tone={latestPain?.flagged ? 'critical' : undefined}
        />
      </dl>

      <div className="rounded-3xl bg-surface p-5 ring-1 ring-line sm:p-7">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold">Range of motion</h3>
            <p className="mt-0.5 text-sm text-muted">Peak knee flexion per session</p>
          </div>
          {first && <p className="label-mono text-muted">Since {shortDate(first.started_at)}</p>}
        </div>
        <div className="mt-6">
          {sessions.length ? <RomChart sessions={sessions} target={assignment.target_angle} /> : <p className="text-muted">No sessions yet.</p>}
        </div>
      </div>

      <div className="rounded-3xl bg-surface p-5 ring-1 ring-line sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <h3 className="text-lg font-bold">Weekly summary</h3>
            <span className="label-mono rounded-md bg-raised px-1.5 py-1 text-[10px] text-ink-2 ring-1 ring-line">Draft</span>
          </div>
          <button onClick={regenerate} disabled={regenerating} className={`${buttonClass('secondary', 'md')} h-10 px-3.5 text-sm`}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className={regenerating ? 'animate-spin' : ''}>
              <path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2.5v3h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {regenerating ? 'Writing…' : 'Regenerate'}
          </button>
        </div>
        <p className={`mt-5 border-l-2 border-brand pl-5 text-[17px] leading-relaxed text-ink transition-opacity ${regenerating ? 'opacity-40' : ''}`}>
          {summary ?? p.latest_summary ?? 'No summary yet.'}
        </p>
        <p className="label-mono mt-5 text-[10px] text-muted">Drafted by Gemini from session data · Review before acting</p>
      </div>

      <div className="overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
        <h3 className="px-6 pb-4 pt-6 text-lg font-bold sm:px-7">Sessions</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="label-mono border-y border-line bg-raised text-left text-muted">
                <th className="px-6 py-3 font-medium sm:pl-7">Date</th>
                <th className="px-3 py-3 text-right font-medium">Reps</th>
                <th className="px-3 py-3 text-right font-medium">Peak</th>
                <th className="px-3 py-3 text-right font-medium">Time</th>
                <th className="px-3 py-3 font-medium">Form</th>
                <th className="px-6 py-3 text-right font-medium sm:pr-7">Pain</th>
              </tr>
            </thead>
            <tbody>
              {sessions.slice(0, 10).map((s) => {
                const isFresh = (fresh[s.id] ?? 0) > now
                return (
                  <tr key={s.id} className={`border-b border-line transition-colors duration-1000 last:border-0 ${isFresh ? 'bg-brand-soft' : ''}`}>
                    <td className="whitespace-nowrap px-6 py-3.5 sm:pl-7">
                      {new Date(s.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      {isFresh && <span className="label-mono ml-2 rounded-md bg-brand px-1.5 py-0.5 text-[10px] text-on-brand">New</span>}
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      {s.reps_done}
                      <span className="text-muted">/{assignment.reps}</span>
                    </td>
                    <td className={`px-3 py-3.5 text-right font-bold ${s.max_angle >= assignment.target_angle ? 'text-brand-ink' : ''}`}>{s.max_angle}°</td>
                    <td className="px-3 py-3.5 text-right text-ink-2">{formatDuration(s.duration_sec)}</td>
                    <td className="px-3 py-3.5 text-ink-2">{s.form_warnings.length ? [...new Set(s.form_warnings)].join(', ') : '—'}</td>
                    <td className="px-6 py-3.5 text-right sm:pr-7">
                      {s.flagged ? (
                        <span className="rounded-md bg-critical-soft px-2 py-0.5 font-bold text-critical ring-1 ring-critical/20">{s.pain_score}</span>
                      ) : (
                        (s.pain_score ?? '—')
                      )}
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

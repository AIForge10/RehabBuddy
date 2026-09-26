import { Link, Navigate, useLocation } from 'react-router-dom'
import { PatientScreen } from '../components/Screen'
import { formatDuration } from '../lib/format'
import { useLanguage } from '../lib/language'
import type { SessionFlowState } from './PainCheck'

export default function SessionDone() {
  const { s } = useLanguage()
  const flow = useLocation().state as SessionFlowState | null
  if (!flow) return <Navigate to="/" replace />

  const { result, assignment, pain } = flow
  const hitTarget = result.max_angle >= assignment.target_angle
  const uniqueWarnings = [...new Set(result.form_warnings)]

  const stats = [
    { label: s.doneReps, value: `${result.reps_done}`, unit: ` / ${assignment.reps}` },
    { label: s.doneDeepest, value: `${result.max_angle}°`, unit: ` / ${assignment.target_angle}°`, accent: hitTarget },
    { label: s.doneTime, value: formatDuration(result.duration_sec) },
  ]

  return (
    <PatientScreen>
      <div className="mt-6 flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-full bg-accent text-white">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="m3 8.5 3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">{s.doneTitle}</h1>
      </div>

      <dl className="mt-8 grid grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-surface">
        {stats.map((st) => (
          <div key={st.label} className="p-5">
            <dt className="text-sm text-ink-2">{st.label}</dt>
            <dd className={`mt-1 text-3xl font-semibold tracking-tight ${st.accent ? 'text-accent' : ''}`}>
              {st.value}
              {st.unit && <span className="text-base font-normal text-muted">{st.unit}</span>}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 rounded-2xl border border-line bg-surface p-5">
        <p className="text-sm text-ink-2">{s.doneForm}</p>
        {uniqueWarnings.length === 0 ? (
          <p className="mt-1 font-medium">{s.doneFormClean}</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {uniqueWarnings.map((w) => (
              <li key={w} className="font-medium">
                {w}
                <span className="text-muted"> ×{result.form_warnings.filter((x) => x === w).length}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pain && (
        <p className={`mt-6 text-sm ${pain.response.flagged ? 'text-critical' : 'text-ink-2'}`}>
          {pain.response.flagged ? s.painFlagged : s.doneSent}
        </p>
      )}

      <Link
        to="/"
        className="mt-8 inline-block rounded-xl border border-line-strong px-6 py-3.5 font-semibold transition-colors hover:bg-surface"
      >
        {s.backHome}
      </Link>
    </PatientScreen>
  )
}

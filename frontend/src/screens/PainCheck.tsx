import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { painCheck } from '../api/client'
import { PatientScreen } from '../components/Screen'
import { sayText } from '../lib/coach'
import { useLanguage } from '../lib/language'
import type { Assignment, PainCheckResponse, SessionResult } from '../types/session'

export interface SessionFlowState {
  sessionId: string
  result: SessionResult
  assignment: Assignment
  pain?: { score: number; response: PainCheckResponse }
}

const SCORES = Array.from({ length: 10 }, (_, i) => i + 1)

export default function PainCheck() {
  const { s, lang } = useLanguage()
  const navigate = useNavigate()
  const flow = useLocation().state as SessionFlowState | null
  const [score, setScore] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [response, setResponse] = useState<PainCheckResponse | null>(null)

  if (!flow) return <Navigate to="/" replace />

  async function submit() {
    if (score == null || !flow) return
    setSending(true)
    const res = await painCheck({ session_id: flow.sessionId, pain_score: score, notes: notes.trim(), language: lang })
    setResponse(res)
    setSending(false)
    sayText(res.reply, lang)
  }

  const next = () => navigate('/done', { state: { ...flow, pain: { score: score!, response: response! } } })

  return (
    <PatientScreen>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{s.painTitle}</h1>

      <fieldset className="mt-8" disabled={Boolean(response) || sending}>
        <legend className="sr-only">{s.painTitle}</legend>
        <div className="grid grid-cols-10 gap-1.5">
          {SCORES.map((n) => {
            const selected = score === n
            return (
              <button
                key={n}
                type="button"
                onClick={() => setScore(n)}
                aria-pressed={selected}
                className={`aspect-square rounded-xl border text-lg font-semibold tabular-nums transition-colors sm:text-xl ${
                  selected
                    ? 'border-ink bg-ink text-surface'
                    : 'border-line bg-surface text-ink hover:border-line-strong'
                }`}
              >
                {n}
              </button>
            )
          })}
        </div>
        <div className="mt-2 flex justify-between text-sm text-muted">
          <span>{s.painNone}</span>
          <span>{s.painWorst}</span>
        </div>

        <label className="mt-8 block">
          <span className="text-sm font-medium text-ink-2">{s.painNotes}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={s.painPlaceholder}
            className="mt-2 w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-base placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </label>
      </fieldset>

      {!response ? (
        <button
          onClick={submit}
          disabled={score == null || sending}
          className="mt-6 w-full rounded-xl bg-accent px-6 py-4 text-lg font-semibold text-white transition-colors hover:bg-accent-strong disabled:bg-line-strong sm:w-auto"
        >
          {sending ? s.painSending : s.painSubmit}
        </button>
      ) : (
        <div aria-live="polite" className="mt-8">
          <div
            className={`rounded-2xl border p-5 ${
              response.flagged ? 'border-critical/30 bg-critical-soft' : 'border-line bg-surface'
            }`}
          >
            {response.flagged && (
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-critical">
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="8" cy="8" r="7" fill="currentColor" />
                  <path d="M8 4.5v4.2M8 11v.3" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                {s.painFlagged}
              </p>
            )}
            <p className="text-lg leading-relaxed">{response.reply}</p>
          </div>
          <button
            onClick={next}
            className="mt-6 w-full rounded-xl bg-ink px-6 py-4 text-lg font-semibold text-surface transition-colors hover:bg-ink-2 sm:w-auto"
          >
            {s.continue}
          </button>
        </div>
      )}
    </PatientScreen>
  )
}

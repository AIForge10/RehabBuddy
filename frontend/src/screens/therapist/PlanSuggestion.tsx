import { useState, type ReactNode } from 'react'
import { getPlanSuggestion, updateAssignment } from '../../api/client'
import { buttonClass } from '../../components/Screen'
import { planChanges, planOf, type Plan } from '../../lib/plan'
import type { PatientOverview, PlanAction, PlanSuggestion } from '../../types/session'

// The copilot's suggested next step for the patient's plan. The AI proposes and
// the therapist decides: nothing reaches the patient until they approve it, and
// approving is the same plan update the editor makes. It's drafted on demand,
// never by the dashboard's poll, so a Gemini call is always the therapist's ask.

interface Draft {
  suggestion: PlanSuggestion
  /** The newest session when it was drafted; one that came in later isn't in it. */
  latest?: string
}

/** This visit's suggestions by patient, so looking at another patient and back keeps them. */
const drafts = new Map<string, Draft>()

const ACTIONS: Record<PlanAction, { label: string; badge: string; value: string; icon: ReactNode }> = {
  progress: {
    label: 'Progress',
    badge: 'bg-brand-soft text-brand-ink ring-brand/25',
    value: 'text-brand-ink',
    icon: <path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" />,
  },
  hold: { label: 'Hold', badge: 'bg-raised text-ink-2 ring-line-strong', value: 'text-ink', icon: <path d="M4 6h8M4 10h8" /> },
  regress: {
    label: 'Ease off',
    badge: 'bg-warn-soft text-warn ring-warn/25',
    value: 'text-warn',
    icon: <path d="M8 3.5v9M4.5 9 8 12.5 11.5 9" />,
  },
}

const FIELDS = [
  { field: 'target_angle', label: 'Target', unit: '°' },
  { field: 'reps', label: 'Reps per session', unit: '' },
  { field: 'times_per_week', label: 'Sessions per week', unit: '' },
] as const

export function PlanSuggestionCard({ p, onEdit, onSent }: { p: PatientOverview; onEdit: (plan: Plan) => void; onSent: () => void }) {
  const id = p.patient.id
  const firstName = p.patient.full_name.split(' ')[0]
  const [draft, setDraftState] = useState<Draft | null>(() => drafts.get(id) ?? null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState<'suggest' | 'send' | null>(null)

  const setDraft = (d: Draft | null) => {
    if (d) drafts.set(id, d)
    else drafts.delete(id)
    setDraftState(d)
  }

  const plan = planOf(p.assignment)
  // Once the plan changes (approved, edited, or from another tab) the suggestion is moot.
  const s = draft && planChanges(draft.suggestion.current, plan).length === 0 ? draft.suggestion : null
  const newer = s != null && draft!.latest !== p.sessions[0]?.id
  const tone = s && ACTIONS[s.action]

  async function suggest() {
    setLoading(true)
    setFailed(null)
    try {
      const latest = p.sessions[0]?.id
      setDraft({ suggestion: await getPlanSuggestion(p), latest })
    } catch {
      setFailed('suggest')
    } finally {
      setLoading(false)
    }
  }

  async function approve() {
    if (!s) return
    setSending(true)
    setFailed(null)
    try {
      await updateAssignment(p.assignment.id, s.proposed)
      setDraft(null)
      onSent()
    } catch {
      setFailed('send')
    } finally {
      setSending(false)
    }
  }

  const changed = s ? FIELDS.filter((f) => s.proposed[f.field] !== s.current[f.field]) : []

  return (
    <section aria-label="Suggested next step" className="rounded-3xl bg-surface p-5 ring-1 ring-line sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="text-lg font-bold">Suggested next step</h3>
            {s && tone && (
              <span className={`label-mono inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] ring-1 ${tone.badge}`}>
                <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {tone.icon}
                </svg>
                {tone.label}
              </span>
            )}
          </div>
          {!s && <p className="mt-0.5 text-sm text-muted">Reads {firstName}’s recent sessions, pain and adherence, and drafts the next plan for you to approve.</p>}
        </div>
        {s ? (
          <p className="label-mono text-[10px] text-muted">{s.confidence} confidence</p>
        ) : (
          <button onClick={suggest} disabled={loading} className={`${buttonClass('secondary', 'md')} h-10 px-3.5 text-sm`}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className={loading ? 'animate-spin' : ''}>
              {loading ? (
                <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              ) : (
                <path d="M8 1.5c.5 3.2 1.8 4.9 5.5 6.5-3.7 1.6-5 3.3-5.5 6.5-.5-3.2-1.8-4.9-5.5-6.5C6.2 6.4 7.5 4.7 8 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              )}
            </svg>
            {loading ? 'Reading sessions…' : 'Suggest next step'}
          </button>
        )}
      </div>

      {loading && !s && (
        <div className="mt-6 space-y-3" aria-hidden="true">
          <div className="h-8 w-56 animate-pulse rounded-lg bg-line" />
          <div className="h-4 w-full max-w-xl animate-pulse rounded bg-line" />
          <div className="h-4 w-3/4 max-w-md animate-pulse rounded bg-line" />
        </div>
      )}
      {failed === 'suggest' && (
        <p role="alert" className="mt-4 text-sm font-semibold text-critical">
          Couldn’t draft a suggestion. Try again.
        </p>
      )}

      {s && tone && (
        <div aria-live="polite">
          {changed.length ? (
            <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-5">
              {changed.map(({ field, label, unit }) => (
                <div key={field}>
                  <dt className="label-mono text-muted">{label}</dt>
                  <dd className="mt-3 flex items-center gap-2.5 text-[32px] font-bold leading-none tracking-tight tabular-nums">
                    <span className="text-muted">
                      {s.current[field]}
                      {unit}
                    </span>
                    <svg width="18" height="18" viewBox="0 0 16 16" role="img" aria-label="to" className="shrink-0 text-muted">
                      <path d="M2.5 8h11M9.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className={tone.value}>
                      {s.proposed[field]}
                      {unit}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-5 text-[15px] text-ink-2">
              <span className="font-bold text-ink">No change</span> · {s.current.reps} × {s.current.target_angle}° · {s.current.times_per_week}×/wk
            </p>
          )}

          <p className="mt-5 border-l-2 border-brand pl-5 text-[17px] leading-relaxed text-ink">{s.rationale}</p>

          {s.evidence.length > 0 && (
            <div className="mt-5">
              <p className="label-mono text-muted">Based on</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {s.evidence.map((e) => (
                  <li key={e} className="rounded-lg bg-raised px-2.5 py-1 text-[13px] text-ink-2 ring-1 ring-line tabular-nums">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {s.guardrails.map((g) => (
            <p key={g} className="mt-4 flex items-start gap-2 text-sm text-ink-2">
              <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" className="mt-0.5 shrink-0 text-ink-2">
                <path d="M8 1.8 13 3.8v3.9c0 3-2.1 5.4-5 6.5-2.9-1.1-5-3.5-5-6.5V3.8Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
              <span>
                <span className="font-semibold text-ink">Safety rule applied.</span> {g}
              </span>
            </p>
          ))}

          {newer && (
            <p className="mt-4 text-sm text-ink-2">
              A new session came in after this was drafted.{' '}
              <button onClick={suggest} disabled={loading} className="font-semibold text-brand-ink underline underline-offset-2 hover:text-ink disabled:opacity-40">
                {loading ? 'Reading sessions…' : 'Suggest again'}
              </button>
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-line pt-5">
            <p className="label-mono text-[10px] text-muted">
              {s.is_fallback ? 'Rule-based from session data, not Gemini' : 'Drafted by Gemini from session data'} · Review before sending
            </p>
            {s.action === 'hold' || !changed.length ? (
              <div className="flex gap-2 max-sm:w-full">
                <button onClick={() => onEdit(plan)} className={`${buttonClass('secondary', 'md')} max-sm:flex-1`}>
                  Edit plan
                </button>
                <button onClick={() => setDraft(null)} className={`${buttonClass('primary', 'md')} max-sm:flex-1`}>
                  Keep plan
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 max-sm:w-full">
                <button onClick={() => setDraft(null)} disabled={sending} className={`${buttonClass('ghost', 'md')} max-sm:flex-1`}>
                  Dismiss
                </button>
                <button onClick={() => onEdit(s.proposed)} disabled={sending} className={`${buttonClass('secondary', 'md')} max-sm:flex-1`}>
                  Edit before sending
                </button>
                <button onClick={approve} disabled={sending} className={`${buttonClass('primary', 'md')} max-sm:w-full`}>
                  {sending ? 'Sending…' : 'Approve & send'}
                </button>
              </div>
            )}
          </div>
          {failed === 'send' && (
            <p role="alert" className="mt-3 text-sm font-semibold text-critical">
              Couldn’t send the plan. Try again.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

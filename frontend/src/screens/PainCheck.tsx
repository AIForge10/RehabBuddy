import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { painCheck } from '../api/client'
import { LogoMark } from '../components/Logo'
import { ArrowRight, Button, PageHeader, PatientScreen } from '../components/Screen'
import { sayText, unlockAudio } from '../lib/coach'
import { exerciseFor } from '../lib/exercises'
import { useLanguage } from '../lib/language'
import type { Assignment, PainCheckResponse, PainSymptom, PainTranscriptResponse, SessionResult } from '../types/session'
import { MIC, painQuestion, say, skipPending, warm } from './pain/say'
import { VoiceAnswer } from './pain/VoiceAnswer'

export interface SessionFlowState {
  sessionId: string
  result: SessionResult
  assignment: Assignment
  /** The patient stopped mid-way by saying it hurts (Live). The check-in leads with it and it's always flagged. */
  stoppedForPain?: boolean
  pain?: { score: number; response: PainCheckResponse }
}

const SCORES = Array.from({ length: 10 }, (_, i) => i + 1)

// The chips a spoken answer can turn on, in the same order as s.painChips.
const SYMPTOMS: PainSymptom[] = ['sharp', 'swelling', 'stiffness', 'clicking', 'felt_good']

// The session's last line ("Session complete", or stopping for pain) plays on
// as this screen opens; the question waits for it rather than cutting it off.
const ASK_AFTER_MS = 1500
const ASK_AFTER_STOP_MS = 3000

// Same bands as s.painLevel. Color is a secondary cue; the number and the
// Mild / Moderate / Severe label carry the meaning.
const band = (n: number) => (n <= 3 ? 0 : n <= 6 ? 1 : 2)
const BAND = [
  { tick: 'bg-pain-1', selected: 'bg-brand-soft text-brand-ink ring-2 ring-inset ring-brand-ink', label: 'text-brand-ink' },
  { tick: 'bg-pain-2', selected: 'bg-warn-soft text-warn ring-2 ring-inset ring-warn', label: 'text-warn' },
  { tick: 'bg-pain-3', selected: 'bg-critical-soft text-critical ring-2 ring-inset ring-critical', label: 'text-critical' },
]

export default function PainCheck() {
  const { s, lang } = useLanguage()
  const navigate = useNavigate()
  const flow = useLocation().state as SessionFlowState | null
  const [score, setScore] = useState<number | null>(null)
  const [chips, setChips] = useState<number[]>([])
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [response, setResponse] = useState<PainCheckResponse | null>(null)
  // Once the patient starts answering out loud, the coach doesn't ask (again).
  const [talking, setTalking] = useState(false)
  // The note as the last spoken answer wrote it, so saying it again replaces it
  // rather than stacking up, unless the patient has edited it since.
  const spokenNote = useRef('')

  const stopped = Boolean(flow?.stoppedForPain)
  const exercise = flow ? exerciseFor(flow.assignment.exercise.joint) : null
  const painTitle = exercise ? exercise.copy[lang].painTitle : ''
  const question = exercise ? painQuestion(exercise, lang, stopped) : ''
  const answered = response != null

  // The coach asks the question out loud, in the exercise's own words. Its
  // audio is asked for right away (Live already did, as the session ended),
  // so it's here by the time the session's last line has finished.
  useEffect(() => {
    if (!question || answered || talking) return
    void warm(question, lang)
    const timer = setTimeout(() => say(question, lang), stopped ? ASK_AFTER_STOP_MS : ASK_AFTER_MS)
    return () => {
      clearTimeout(timer)
      skipPending()
    }
  }, [question, stopped, answered, talking, lang])

  if (!flow) return <Navigate to="/" replace />

  const toggleChip = (i: number) => setChips((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]))

  // A spoken answer fills in the form; the patient still checks it and taps Send.
  function heard(res: PainTranscriptResponse) {
    if (res.pain_score != null) setScore(res.pain_score)
    const on = res.symptoms.map((x) => SYMPTOMS.indexOf(x)).filter((i) => i >= 0)
    setChips((c) => [...c, ...on.filter((i) => !c.includes(i))])
    if (res.notes) {
      const before = spokenNote.current
      spokenNote.current = res.notes
      setNotes((cur) => (!cur.trim() || cur.trim() === before ? res.notes : `${cur.trim()} ${res.notes}`))
    }
  }

  async function submit() {
    if (score == null || !flow) return
    unlockAudio() // the reply plays after the request, outside this tap
    setSending(true)
    const text = [...chips.map((i) => s.painChips[i]), notes.trim()].filter(Boolean).join('. ')
    const res = await painCheck({ session_id: flow.sessionId, pain_score: score, notes: text, language: lang, stopped_for_pain: stopped })
    setResponse(res)
    setSending(false)
    skipPending()
    sayText(res.reply, lang, res.audio_url)
  }

  const next = () => navigate('/done', { state: { ...flow, pain: { score: score!, response: response! } } })
  const locked = Boolean(response) || sending

  return (
    <PatientScreen>
      <PageHeader
        kicker={
          stopped && (
            <span className="inline-flex items-center gap-2 rounded-full bg-critical-soft px-3 py-1.5 text-sm font-bold text-critical ring-1 ring-critical/20">
              <span aria-hidden="true" className="size-2 rounded-full bg-critical" />
              {s.painStopped}
            </span>
          )
        }
        title={painTitle}
        sub={stopped ? s.painStoppedSub : MIC ? s.painSubVoice : s.painSub}
      />

      <fieldset className="mt-8" disabled={locked}>
        <legend className="sr-only">{painTitle}</legend>
        {MIC && (
          <div className="mb-6">
            <VoiceAnswer sessionId={flow.sessionId} disabled={locked} onStart={() => setTalking(true)} onAnswer={heard} />
          </div>
        )}
        <div className="rounded-3xl bg-surface p-3 ring-1 ring-line sm:p-4">
          <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
            {SCORES.map((n) => {
              const selected = score === n
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setScore(n)}
                  aria-pressed={selected}
                  className={`relative h-16 rounded-xl text-xl font-bold tabular-nums transition-[background-color,box-shadow,color] duration-200 ${
                    selected ? BAND[band(n)].selected : 'bg-raised text-ink ring-1 ring-line ring-inset hover:ring-line-strong'
                  }`}
                >
                  {n}
                  <span aria-hidden="true" className={`absolute inset-x-3 bottom-2 h-1 rounded-full ${BAND[band(n)].tick} ${selected ? '' : 'opacity-60'}`} />
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex h-6 items-center justify-between px-1">
            <span className="label-mono text-muted">{s.painNone}</span>
            {score != null && (
              <span key={score} aria-live="polite" className={`animate-rise text-[15px] font-bold ${BAND[band(score)].label}`}>
                {score} · {s.painLevel(score)}
              </span>
            )}
            <span className="label-mono text-muted">{s.painWorst}</span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {s.painChips.map((label, i) => {
            const on = chips.includes(i)
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggleChip(i)}
                aria-pressed={on}
                className={`inline-flex h-11 items-center rounded-full px-4 text-[15px] font-semibold transition-colors duration-200 ${
                  on ? 'bg-ink text-canvas' : 'bg-surface text-ink-2 ring-1 ring-line-strong hover:text-ink hover:ring-ink/30'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        <label className="mt-7 block">
          <span className="text-[15px] font-semibold">{s.painNotes}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={s.painPlaceholder}
            className="mt-2 w-full resize-none rounded-xl bg-surface px-4 py-3 text-base leading-relaxed ring-1 ring-line-strong transition-shadow placeholder:text-muted hover:ring-ink/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink"
          />
        </label>
      </fieldset>

      {!response ? (
        <Button onClick={submit} disabled={score == null || sending} className="mt-6 w-full">
          {sending ? s.painSending : s.painSubmit}
        </Button>
      ) : (
        <div aria-live="polite" className="mt-8 animate-rise">
          {response.flagged && (
            <p className="mb-4 flex items-center gap-2.5 rounded-xl bg-critical-soft px-4 py-3 text-[15px] font-bold text-critical ring-1 ring-critical/20">
              <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
                <circle cx="8" cy="8" r="7" fill="currentColor" />
                <path d="M8 4.5v4.2M8 11v.3" className="stroke-critical-soft" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              {s.painFlagged}
            </p>
          )}
          <div className="flex gap-3">
            <div className="shrink-0 pt-1">
              <LogoMark size={36} />
            </div>
            <div className="rounded-2xl rounded-tl-md bg-surface px-5 py-4 ring-1 ring-line">
              <p className="label-mono text-brand-ink">{s.coach}</p>
              <p className="mt-2 text-lg leading-relaxed">{response.reply}</p>
            </div>
          </div>
          <Button onClick={next} className="mt-6 w-full">
            {s.continue}
            <ArrowRight />
          </Button>
        </div>
      )}
    </PatientScreen>
  )
}

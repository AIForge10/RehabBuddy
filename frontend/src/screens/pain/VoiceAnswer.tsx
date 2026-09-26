import { useEffect, useRef, useState } from 'react'
import { ApiError, transcribePain } from '../../api/client'
import { stopCoach, unlockAudio } from '../../lib/coach'
import { useLanguage } from '../../lib/language'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { RecordingError, useRecorder } from '../../lib/useRecorder'
import type { PainTranscriptResponse } from '../../types/session'
import { say, skipPending } from './say'

// off: the backend can't transcribe at all (503), so trying again won't help.
type Phase = 'idle' | 'listening' | 'thinking' | 'heard' | 'empty' | 'error' | 'denied' | 'off'

/**
 * The pain check answered out loud: tap, say "about a six, a bit sharp on the
 * inside", and the score, chips and note fill themselves in. It never sends:
 * the patient checks what was heard and taps Send like everyone else. The
 * recording goes to the backend for speech-to-text and is never stored.
 */
export function VoiceAnswer({
  sessionId,
  disabled,
  onStart,
  onAnswer,
}: {
  sessionId: string
  /** After Send: stop listening, and ignore an answer still on its way. */
  disabled: boolean
  /** The patient tapped the mic: the coach shouldn't ask over them. */
  onStart: () => void
  onAnswer: (res: PainTranscriptResponse) => void
}) {
  const { s, lang } = useLanguage()
  const reduced = useReducedMotion()
  const recorder = useRecorder()
  const [phase, setPhase] = useState<Phase>('idle')
  const [heard, setHeard] = useState<PainTranscriptResponse | null>(null)
  const locked = useRef(disabled)

  const { cancel } = recorder
  useEffect(() => {
    locked.current = disabled
    if (disabled) cancel()
  }, [disabled, cancel])

  async function tap() {
    if (phase === 'listening') return recorder.stop()
    // Inside the tap, so iOS lets the coach's lines and the reply play later.
    unlockAudio()
    // Quiet, so the coach's question isn't recorded as the answer.
    onStart()
    skipPending()
    stopCoach()
    const answerLang = lang
    setPhase('listening')
    let clip: Blob
    try {
      clip = await recorder.start()
    } catch (err) {
      if (err instanceof RecordingError && err.kind === 'cancelled') setPhase('idle')
      else setPhase(err instanceof RecordingError && err.kind === 'denied' ? 'denied' : 'error')
      return
    }
    setPhase('thinking')
    let res: PainTranscriptResponse
    try {
      res = await transcribePain(sessionId, clip, answerLang)
    } catch (err) {
      if (locked.current) return
      const off = err instanceof ApiError && err.status === 503
      setPhase(off ? 'off' : 'error')
      say(off ? s.painVoiceOff : s.painVoiceError, answerLang)
      return
    }
    if (locked.current) return
    if (!res.transcript) {
      setPhase('empty')
      say(s.painNoSpeech, answerLang)
      return
    }
    setHeard(res)
    setPhase('heard')
    onAnswer(res)
    if (res.pain_score == null) say(s.painNoScore, answerLang)
  }

  const listening = phase === 'listening'
  const thinking = phase === 'thinking'

  return (
    <div className="rounded-3xl bg-surface p-4 ring-1 ring-line sm:p-5">
      <div className="flex items-center gap-4 sm:gap-5">
        <button
          type="button"
          onClick={tap}
          disabled={thinking || phase === 'off'}
          aria-label={listening ? s.painVoiceStop : s.painVoiceStart}
          className="relative grid size-18 shrink-0 place-items-center rounded-full transition-transform duration-200 active:scale-[0.96] disabled:opacity-60"
        >
          {/* The level ring: grows with the voice, so the patient can see it's hearing them. */}
          {listening && (
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-brand/30 transition-transform duration-75"
              style={reduced ? { opacity: 0.4 + recorder.level * 0.6 } : { transform: `scale(${1 + recorder.level * 0.4})` }}
            />
          )}
          <span
            className={`relative grid size-18 place-items-center rounded-full shadow-[inset_0_1px_0_rgb(255_255_255/0.22)] transition-colors duration-200 ${
              listening ? 'bg-ink text-canvas' : 'bg-brand text-on-brand hover:bg-brand-strong'
            }`}
          >
            {listening ? <StopIcon /> : <MicIcon />}
          </span>
        </button>

        <div aria-live="polite" className="min-w-0 flex-1">
          {listening ? (
            <p className="text-lg font-bold">{s.painListening}</p>
          ) : thinking ? (
            <p className="animate-pulse text-lg font-bold text-ink-2">{s.painThinking}</p>
          ) : phase === 'heard' && heard ? (
            <>
              <p className="label-mono text-muted">{s.painHeard}</p>
              <p lang={lang} className="mt-1 animate-rise text-lg leading-snug">
                “{heard.transcript}”
              </p>
              <p className={`mt-1.5 text-[15px] font-semibold ${heard.pain_score == null ? 'text-warn' : 'text-brand-ink'}`}>
                {heard.pain_score == null ? s.painNoScore : s.painHeardScore(heard.pain_score)}
              </p>
            </>
          ) : phase === 'empty' || phase === 'error' || phase === 'denied' || phase === 'off' ? (
            <p className="text-[17px] font-semibold text-warn">
              {{ empty: s.painNoSpeech, error: s.painVoiceError, denied: s.painMicBlocked, off: s.painVoiceOff }[phase]}
            </p>
          ) : (
            <>
              <p className="text-lg font-bold">{s.painVoiceTitle}</p>
              <p className="mt-0.5 text-[15px] leading-snug text-ink-2">{s.painVoiceHint}</p>
            </>
          )}
        </div>
      </div>
      <p className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-sm text-muted">
        <LockIcon />
        {s.painVoicePrivate}
      </p>
    </div>
  )
}

function MicIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill="currentColor" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="4" y="4" width="14" height="14" rx="3" fill="currentColor" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
      <rect x="2.5" y="6" width="9" height="6.5" rx="1.5" fill="currentColor" />
      <path d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

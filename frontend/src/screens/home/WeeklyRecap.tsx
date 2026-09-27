import { useEffect, useRef, useState } from 'react'
import { getWeeklyRecap } from '../../api/client'
import { Section } from '../../components/Ledger'
import { LogoMark } from '../../components/Logo'
import { Button } from '../../components/Screen'
import { sayText, stopCoach, unlockAudio } from '../../lib/coach'
import { useLanguage } from '../../lib/language'
import type { Language, PatientOverview, WeeklyRecapResponse } from '../../types/session'

// The request for the recap on screen. React runs effects twice in development,
// and Chrome holds a second identical GET until the first returns, so a
// Gemini timeout would be waited out twice; the second run shares the first's
// request instead. Cleared when it settles, so opening Home again refetches.
let inFlight: { key: string; promise: Promise<WeeklyRecapResponse> } | null = null

function fetchRecap(key: string, overview: PatientOverview, lang: Language): Promise<WeeklyRecapResponse> {
  if (inFlight?.key !== key) {
    const promise = getWeeklyRecap(overview, lang).finally(() => {
      if (inFlight?.promise === promise) inFlight = null
    })
    inFlight = { key, promise }
  }
  return inFlight.promise
}

/**
 * The coach's recap of the last 7 days, in the patient's language, with a
 * button that reads it aloud in the coach's voice. An open section like the
 * ones below it, with the coach's mark beside the words as on the pain check.
 */
export function WeeklyRecap({ overview }: { overview: PatientOverview }) {
  const { s, lang } = useLanguage()
  const latest = overview.sessions[0]?.id // most recent first
  // Home refreshes the overview every few seconds. The recap only changes with
  // a new session, a new red flag, a plan change or another language, so only those refetch it.
  const a = overview.assignment
  const key = `${overview.patient.id}|${lang}|${latest}|${overview.red_flags.length}|${a.exercise.id}|${a.target_angle}|${a.times_per_week}`
  // Kept with the key it was fetched for, so a language switch shows the loading
  // state rather than the old language's recap.
  const [recap, setRecap] = useState<{ key: string; res: WeeklyRecapResponse } | null>(null)
  const current = recap?.key === key ? recap.res : null
  const spoke = useRef(false)

  useEffect(() => {
    if (!latest) return
    let live = true
    fetchRecap(key, overview, lang).then((res) => live && setRecap({ key, res }))
    return () => {
      live = false
      // Stop reading a recap that's no longer on screen, so it doesn't talk over
      // the session's cues (the coach skips a cue while it's busy).
      if (spoke.current) stopCoach()
      spoke.current = false
    }
    // The render that changed the key has that overview and language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  function listen(res: WeeklyRecapResponse) {
    unlockAudio() // inside the tap, so iOS lets the voice (or the speech fallback) play
    spoke.current = true
    sayText(res.text, res.language, res.audio_url)
  }

  return (
    <Section title={s.weeklyRecap} aside={latest && s.weeklyRecapSub} className="lg:col-span-12">
      <div className="mt-5 flex gap-4">
        <div className="shrink-0 pt-0.5">
          <LogoMark size={36} />
        </div>
        <div className="min-w-0 max-w-[62ch] flex-1">
          {!latest ? (
            <p className="text-lg leading-relaxed text-ink-2">{s.weeklyEmpty}</p>
          ) : !current ? (
            <div aria-busy="true" aria-label={s.weeklyWriting}>
              <div className="mt-1 h-5 animate-pulse rounded bg-line" />
              <div className="mt-3 h-5 w-11/12 animate-pulse rounded bg-line" />
              <div className="mt-3 h-5 w-2/3 animate-pulse rounded bg-line" />
              <div className="mt-5 h-11 w-32 animate-pulse rounded-xl bg-line" />
            </div>
          ) : (
            <div className="animate-rise">
              <p lang={current.language} className="text-lg leading-relaxed sm:text-xl sm:leading-relaxed">
                {current.text}
              </p>
              <Button variant="secondary" size="md" className="mt-4" onClick={() => listen(current)}>
                <SpeakerIcon />
                {s.weeklyListen}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Section>
  )
}

function SpeakerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M3 7h2.5L9 4v10l-3.5-3H3z" fill="currentColor" />
      <path d="M11.8 6.4a3.6 3.6 0 0 1 0 5.2M13.9 4.3a6.6 6.6 0 0 1 0 9.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

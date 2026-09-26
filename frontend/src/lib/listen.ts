// "It hurts": while a session runs, the microphone listens for the patient
// saying it hurts or asking to stop, in English or Spanish, and the session
// stops for them (screens/session/Live.tsx). Where the browser has no speech
// recognition (Firefox, for one), or the microphone is refused, the feature
// simply isn't there.
//
// Privacy: Chrome's speech recognition sends the microphone's audio to Google
// to be transcribed. The product's promise is that the camera's VIDEO never
// leaves the device; this is audio, and only while a session runs.
//
// The coach talks in the same room the microphone hears. Its lines never read
// as a stop request, and while it talks (and just after), what's heard is
// dropped when every word of it is in the coach's line: "para" is Spanish for
// "stop" but also for "for", and the coach says it. Only short utterances count.

import { useEffect, useRef, useState } from 'react'
import { coachLastLine } from './coach'
import { t } from './i18n'
import { isNativeApp } from './native'
import type { Language } from '../types/session'

// Just what's used here: TypeScript's DOM library has the recognizer's events but not the recognizer.
interface Recognizer {
  lang: string
  continuous: boolean
  interimResults: boolean
  onstart: (() => void) | null
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}

type RecognizerClass = new () => Recognizer

function recognition(): RecognizerClass | undefined {
  // The iOS and Android apps don't ask for the microphone yet (no usage description or
  // RECORD_AUDIO in mobile/), and iOS ends an app that opens it without one.
  if (isNativeApp) return undefined
  const w = globalThis as { SpeechRecognition?: RecognizerClass; webkitSpeechRecognition?: RecognizerClass }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

/** The recognizer finishes transcribing the coach a moment after it stops talking. */
const ECHO_MS = 1500
/** Longer than this, it's conversation (or the coach), not someone asking to stop. */
const MAX_WORDS = 8
/** Errors that mean no microphone for this page: trying again won't help. */
const FATAL = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'])
/** A recognizer that keeps failing (no network, or a browser without the speech service) is given up on. */
const MAX_FAILURES = 4

// --- What counts as "stop" ---------------------------------------------------------

// Each means stop when it's all that was said, give or take a "please" or a "no".
const ALONE = /^(stop+|o+w+|ou+ch+|owch|a+y+|a+u+|auch|para|pare|basta|alto|detente)$/
const FILLER = new Set(['please', 'no', 'wait', 'oh', 'ah', 'hey', 'okay', 'ok', 'por', 'favor', 'ya', 'espera', 'oye', 'dios', 'mio'])
// Each means stop anywhere in a short utterance, unless one of the few words before it negates it.
const ANYWHERE = /^(hurts?|hurting|painful|ouch|stop|duele|duelen|dolio|dolor|basta|parar|paremos|detente|detengase)$/
const NEGATION = new Set([
  'not', 'doesnt', 'dont', 'didnt', 'isnt', 'wont', 'cant', 'never', 'nothing', 'no',
  'sin', 'nada', 'ni', 'tampoco',
])

const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // "dolió" → "dolio", so either spelling matches
    .replace(/['’]/g, '') // "doesn't" → "doesnt"
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

/** Whether a transcript is the patient saying it hurts or asking to stop ("ouch", "it hurts", "¡para!", "me duele"). */
export function isStopRequest(transcript: string): boolean {
  const words = wordsOf(transcript)
  if (!words.length || words.length > MAX_WORDS) return false
  if (words.every((w) => ALONE.test(w) || FILLER.has(w)) && words.some((w) => ALONE.test(w))) return true
  return words.some((w, i) => ANYWHERE.test(w) && !words.slice(Math.max(0, i - 3), i).some((b) => NEGATION.has(b)))
}

/** Whether the microphone just heard the coach itself: every word is in what it's saying or just said. */
function isCoach(transcript: string): boolean {
  const { text, quietFor } = coachLastLine()
  if (quietFor > ECHO_MS) return false
  const said = new Set(wordsOf(text))
  return wordsOf(transcript).every((w) => said.has(w))
}

// --- The recognizer ----------------------------------------------------------------

let recognizer: Recognizer | null = null
/** The session's tap has started listening at least once, so it may restart without one. */
let armed = false
let wanted = false
let denied = false
let live = false
let lang: Language = 'en'
let failures = 0
let failed = false
let startedAt = 0
let restart: ReturnType<typeof setTimeout> | undefined
const onHeard = new Set<() => void>()
const onLive = new Set<(on: boolean) => void>()

function setLive(on: boolean) {
  if (on === live) return
  live = on
  for (const f of onLive) f(on)
}

function begin() {
  if (!recognizer || !wanted || denied) return
  recognizer.lang = t(lang).locale
  failed = false
  startedAt = performance.now()
  try {
    recognizer.start()
  } catch {
    /* already listening */
  }
}

function create(Ctor: RecognizerClass): Recognizer {
  const r = new Ctor()
  r.continuous = true
  r.interimResults = false // a half-heard "para que…" would read as "para"
  r.onstart = () => setLive(wanted)
  r.onresult = (e) => {
    failures = 0
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const heard = e.results[i][0].transcript
      if (e.results[i].isFinal && isStopRequest(heard) && !isCoach(heard)) {
        for (const f of onHeard) f()
        return
      }
    }
  }
  r.onerror = (e) => {
    if (FATAL.has(e.error)) denied = true
    else if (e.error !== 'no-speech' && e.error !== 'aborted') failed = true
  }
  // Chrome ends a continuous session after a stretch of silence or a network
  // hiccup, so while it's wanted it starts again, waiting longer each time it
  // fails straight away.
  r.onend = () => {
    if (!wanted || denied) return setLive(false)
    failures = failed || performance.now() - startedAt < 1000 ? failures + 1 : 0
    if (failures > MAX_FAILURES) return setLive(false)
    restart = setTimeout(begin, 250 * 2 ** failures)
  }
  return r
}

function resume() {
  const Recognition = recognition()
  if (!Recognition || !armed || denied) return
  recognizer ??= create(Recognition)
  wanted = true
  clearTimeout(restart)
  begin()
}

function pause() {
  wanted = false
  clearTimeout(restart)
  recognizer?.abort()
  setLive(false)
}

/**
 * Starts the microphone. Call inside the tap that starts the session: some
 * browsers only open the microphone from a tap. Nothing is acted on until a
 * screen listens with useStopRequest.
 */
export function startListening(language: Language) {
  if (!recognition()) return
  lang = language
  armed = true
  failures = 0
  resume()
}

/**
 * While `active`, calls `onStop` when the patient says it hurts or asks to
 * stop. Returns whether the microphone is listening, for an on-screen hint.
 * Leaving the screen turns the microphone off.
 */
export function useStopRequest(active: boolean, language: Language, onStop: () => void): boolean {
  const [on, setOn] = useState(live)
  const handler = useRef(onStop)
  useEffect(() => {
    handler.current = onStop
  })

  useEffect(() => {
    onLive.add(setOn)
    return () => {
      onLive.delete(setOn)
      pause()
    }
  }, [])

  // A new language takes effect when the recognizer restarts, so restart it now.
  useEffect(() => {
    if (language === lang) return
    lang = language
    if (wanted) recognizer?.abort()
  }, [language])

  useEffect(() => {
    if (!active) return
    const heard = () => handler.current()
    onHeard.add(heard)
    resume()
    return () => {
      onHeard.delete(heard)
      pause()
    }
  }, [active])

  return active && on
}

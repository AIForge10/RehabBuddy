// Voice coach. Everything plays through one shared <audio> element:
//  - Live-session cues are fixed lines, pre-generated with ElevenLabs by
//    scripts/generate_audio.py into public/audio/{lang}/{clip}.mp3. Live
//    preloads them when the session opens, so a cue plays the moment a rep
//    lands.
//  - Free-form lines (the AI pain-check reply) come with a backend URL that
//    streams ElevenLabs audio while it is still being generated.
// A line with no audio, or whose audio fails or doesn't start in time, is read
// by the browser's speech synthesis, so the coach is never silent.
//
// Cue ids below are the file-name contract with Shan. Three cues name the
// movement (start, bend_deeper, knee_in), so for exercises other than the knee
// their text comes from the exercise and the clip is {cue}_{part}.mp3, e.g.
// start_shoulder.mp3. knee_in kept its first name but is each exercise's form
// cue (`cues.form`): lib/formWarnings.ts decides which warning plays which cue.

import type { Exercise } from './exercises'
import type { Language } from '../types/session'

export type CoachCue = 'start' | 'good_rep' | 'bend_deeper' | 'knee_in' | 'slow_down' | 'halfway' | 'last_rep' | 'done'

export const CUES: readonly CoachCue[] = ['start', 'good_rep', 'bend_deeper', 'knee_in', 'slow_down', 'halfway', 'last_rep', 'done']

export const CUE_TEXT: Record<Language, Record<CoachCue, string>> = {
  en: {
    start: "Let's begin. Bend your knee slowly.",
    good_rep: 'Good rep.',
    bend_deeper: 'Try to bend a little deeper.',
    knee_in: 'Keep your thigh still on the chair.',
    slow_down: 'Slow down. Take your time.',
    halfway: 'Halfway there. Keep going.',
    last_rep: 'One more.',
    done: 'Great work. Session complete.',
  },
  es: {
    start: 'Empecemos. Dobla la rodilla despacio.',
    good_rep: 'Buena repetición.',
    bend_deeper: 'Intenta doblar un poco más.',
    knee_in: 'Mantén el muslo quieto sobre la silla.',
    slow_down: 'Más despacio. Tómate tu tiempo.',
    halfway: 'Vas por la mitad. Sigue así.',
    last_rep: 'Una más.',
    done: 'Buen trabajo. Sesión terminada.',
  },
}

// Cues that may cut off whatever is playing. A too-fast rep lands while the
// last rep's cue may still be playing, which is exactly when it needs hearing.
const PRIORITY: CoachCue[] = ['knee_in', 'slow_down', 'done']

// Audio that hasn't started by now (slow network or backend) is spoken instead.
const START_TIMEOUT_MS = 4000

// 10 ms of silence, played inside a tap to unlock the player (see unlockAudio).
const SILENCE =
  'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA=='

const NAMED: Partial<Record<CoachCue, keyof Exercise['copy']['en']['cues']>> = { start: 'start', bend_deeper: 'bend_deeper', knee_in: 'form' }

/** A cue's clip name and caption. frontend/scripts/cue-lines.mjs reads this to list the clips to generate. */
export function cueLine(cue: CoachCue, lang: Language, exercise?: Exercise): { clip: string; text: string } {
  const named = exercise && exercise.part !== 'knee' ? NAMED[cue] : undefined
  return named ? { clip: `${cue}_${exercise!.part}`, text: exercise!.copy[lang].cues[named] } : { clip: cue, text: CUE_TEXT[lang][cue] }
}

let player: HTMLAudioElement | null = null
const audio = () => (player ??= new Audio())
let unlocked = false
let busy = false
// Bumped whenever a new line takes over, so callbacks from the old one do nothing.
let turn = 0

// Cue clips by path: an object URL once fetched, null if the file is missing.
const clips = new Map<string, Promise<string | null>>()

function loadClip(path: string): Promise<string | null> {
  let clip = clips.get(path)
  if (!clip) {
    clip = fetch(path)
      .then(async (r) => (r.ok && r.headers.get('content-type')?.startsWith('audio/') ? URL.createObjectURL(await r.blob()) : null))
      .catch(() => null)
    clips.set(path, clip)
  }
  return clip
}

function speak(text: string, lang: Language) {
  if (!('speechSynthesis' in window)) {
    busy = false
    return
  }
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang === 'es' ? 'es-ES' : 'en-US'
  u.rate = 1
  u.onend = u.onerror = () => {
    busy = false
  }
  window.speechSynthesis.speak(u)
}

function play(src: string, text: string, lang: Language) {
  const me = turn
  const a = audio()
  let started = false
  let fellBack = false
  const finished = () => {
    if (me === turn) busy = false
  }
  const fallBack = () => {
    if (started || fellBack || me !== turn) return
    fellBack = true
    a.pause()
    speak(text, lang)
  }
  a.onplaying = () => {
    started = true
  }
  a.onended = finished
  a.onerror = () => (started ? finished() : fallBack())
  a.src = src
  a.play().catch(fallBack)
  setTimeout(fallBack, START_TIMEOUT_MS)
}

function stop() {
  turn++
  player?.pause()
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  busy = false
}

/**
 * Call from a tap handler before the coach will speak. iOS only lets audio play
 * without a tap on an element that has already played inside one, and the coach
 * speaks later (when a rep lands, when the AI replies), so the tap that leads
 * there unlocks the shared player and speech synthesis.
 */
export function unlockAudio() {
  if (unlocked) return
  unlocked = true
  const a = audio()
  a.src = SILENCE
  a.play().catch(() => {})
  if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(''))
}

/** Fetch every cue clip for this session up front, so none waits on the network mid-rep. */
export function preloadCues(lang: Language, exercise: Exercise) {
  for (const cue of CUES) loadClip(`/audio/${lang}/${cueLine(cue, lang, exercise).clip}.mp3`)
}

/** Speak a cue. Returns the line spoken so the UI can show it as a caption. */
export function playCue(cue: CoachCue, lang: Language, exercise?: Exercise): string {
  const { clip, text } = cueLine(cue, lang, exercise)
  if (busy) {
    if (!PRIORITY.includes(cue)) return text
    stop()
  }
  busy = true
  const me = ++turn
  loadClip(`/audio/${lang}/${clip}.mp3`).then((url) => {
    if (me !== turn) return
    if (url) play(url, text, lang)
    else speak(text, lang)
  })
  return text
}

/** Free-form line (e.g. the AI pain-check reply), streamed from `audioUrl` when the backend voiced it. */
export function sayText(text: string, lang: Language, audioUrl?: string | null) {
  stop()
  busy = true
  if (audioUrl) play(audioUrl, text, lang)
  else speak(text, lang)
}

export function stopCoach() {
  stop()
}

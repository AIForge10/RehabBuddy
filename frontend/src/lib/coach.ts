// Voice coach. Plays Shan's cached ElevenLabs clips from
// public/audio/{lang}/{cue}.mp3; if a clip is missing or fails to load, falls
// back to the browser's speech synthesis so the coach is never silent.
//
// Cue ids below are the file-name contract with Shan. Three cues name the
// movement (start, bend_deeper, knee_in), so for exercises other than the knee
// their text comes from the exercise and the clip is {cue}_{part}.mp3, e.g.
// start_shoulder.mp3; until those are recorded, speech synthesis reads them.

import type { Exercise } from './exercises'
import type { Language } from '../types/session'

export type CoachCue = 'start' | 'good_rep' | 'bend_deeper' | 'knee_in' | 'halfway' | 'last_rep' | 'done'

export const CUE_TEXT: Record<Language, Record<CoachCue, string>> = {
  en: {
    start: "Let's begin. Bend your knee slowly.",
    good_rep: 'Good rep.',
    bend_deeper: 'Try to bend a little deeper.',
    knee_in: 'Keep your knee in line with your foot.',
    halfway: 'Halfway there. Keep going.',
    last_rep: 'One more.',
    done: 'Great work. Session complete.',
  },
  es: {
    start: 'Empecemos. Dobla la rodilla despacio.',
    good_rep: 'Buena repetición.',
    bend_deeper: 'Intenta doblar un poco más.',
    knee_in: 'Mantén la rodilla alineada con el pie.',
    halfway: 'Vas por la mitad. Sigue así.',
    last_rep: 'Una más.',
    done: 'Buen trabajo. Sesión terminada.',
  },
}

// Cues that may cut off whatever is playing.
const PRIORITY: CoachCue[] = ['knee_in', 'done']

let current: HTMLAudioElement | null = null
let busy = false

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

function stop() {
  current?.pause()
  current = null
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  busy = false
}

const NAMED: Partial<Record<CoachCue, keyof Exercise['copy']['en']['cues']>> = { start: 'start', bend_deeper: 'bend_deeper', knee_in: 'form' }

/** Speak a cue. Returns the line spoken so the UI can show it as a caption. */
export function playCue(cue: CoachCue, lang: Language, exercise?: Exercise): string {
  const named = exercise && exercise.part !== 'knee' ? NAMED[cue] : undefined
  const text = named ? exercise!.copy[lang].cues[named] : CUE_TEXT[lang][cue]
  const clip = named ? `${cue}_${exercise!.part}` : cue
  if (busy) {
    if (!PRIORITY.includes(cue)) return text
    stop()
  }
  busy = true
  const audio = new Audio(`/audio/${lang}/${clip}.mp3`)
  current = audio
  audio.onended = () => {
    busy = false
  }
  audio.onerror = () => speak(text, lang)
  audio.play().catch(() => speak(text, lang))
  return text
}

/** Free-form line (e.g. the AI pain-check reply). Not cached, so browser TTS. */
export function sayText(text: string, lang: Language) {
  stop()
  busy = true
  speak(text, lang)
}

export function stopCoach() {
  stop()
}

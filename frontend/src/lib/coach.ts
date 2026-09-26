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
// start_shoulder.mp3.

import type { Exercise } from './exercises'
import type { Language } from '../types/session'

export type CoachCue =
  | 'start'
  // Encouragement pool
  | 'good_rep'
  | 'nicely_done'
  | 'good_job'
  | 'great_control'
  | 'smooth_movement'
  | 'keep_it_up'
  | 'perfect_form'
  | 'looking_good'
  // Target hit pool
  | 'target_hit'
  | 'great_depth'
  | 'full_range'
  // Depth corrections
  | 'bend_deeper'
  | 'push_a_bit_more'
  | 'almost_there'
  // Speed / pacing
  | 'slow_down'
  | 'control_the_return'
  // Camera visibility
  | 'reposition'
  | 'step_back'
  // Streaks
  | 'streak'
  | 'great_rhythm'
  // Form warning
  | 'knee_in'
  // Milestones & Finish
  | 'halfway'
  | 'last_rep'
  | 'final_rep'
  | 'done'
  | 'session_complete'

export const CUES: readonly CoachCue[] = [
  'start',
  'good_rep',
  'nicely_done',
  'good_job',
  'great_control',
  'smooth_movement',
  'keep_it_up',
  'perfect_form',
  'looking_good',
  'target_hit',
  'great_depth',
  'full_range',
  'bend_deeper',
  'push_a_bit_more',
  'almost_there',
  'slow_down',
  'control_the_return',
  'reposition',
  'step_back',
  'streak',
  'great_rhythm',
  'knee_in',
  'halfway',
  'last_rep',
  'final_rep',
  'done',
  'session_complete',
]

export const CUE_TEXT: Record<Language, Record<CoachCue, string>> = {
  en: {
    start: "Let's begin. Bend your knee slowly.",
    // Encouragement
    good_rep: 'Good rep.',
    nicely_done: 'Nicely, done.',
    good_job: 'Good job.',
    great_control: 'Great control.',
    smooth_movement: 'Smooth movement.',
    keep_it_up: 'Keep it up.',
    perfect_form: 'Perfect form.',
    looking_good: 'Looking good.',
    // Target reached
    target_hit: 'Right on target!',
    great_depth: 'Great depth on that one!',
    full_range: 'Full range of motion, excellent!',
    // Depth corrections
    bend_deeper: 'Try to bend a little deeper.',
    push_a_bit_more: 'Try to push just a bit more.',
    almost_there: 'Almost there, reach a little further.',
    // Speed
    slow_down: 'Slow and steady. Control the movement.',
    control_the_return: "Don't rush the return.",
    // Visibility
    reposition: "Make sure you're in full view of the camera.",
    step_back: 'Step back slightly so your leg is visible.',
    // Streaks
    streak: 'Three great reps in a row!',
    great_rhythm: "You're in a great rhythm.",
    // Form
    knee_in: 'Keep your knee in line with your foot.',
    // Milestones
    halfway: 'Halfway there. Keep going.',
    last_rep: 'One more.',
    final_rep: 'Final rep, make it count!',
    done: 'Great work. Session complete.',
    session_complete: 'All done! Fantastic effort today.',
  },
  es: {
    start: 'Empecemos. Dobla la rodilla despacio.',
    // Encouragement
    good_rep: 'Buena repetición.',
    nicely_done: 'Bien hecho.',
    good_job: 'Buen trabajo.',
    great_control: 'Gran control.',
    smooth_movement: 'Movimiento fluido.',
    keep_it_up: 'Sigue así.',
    perfect_form: 'Forma perfecta.',
    looking_good: 'Se ve muy bien.',
    // Target reached
    target_hit: '¡Justo en el objetivo!',
    great_depth: '¡Gran profundidad en esa!',
    full_range: '¡Rango completo, excelente!',
    // Depth corrections
    bend_deeper: 'Intenta doblar un poco más.',
    push_a_bit_more: 'Intenta avanzar un poco más.',
    almost_there: 'Casi llegas, un poco más.',
    // Speed
    slow_down: 'Lento y constante. Controla el movimiento.',
    control_the_return: 'No te apresures al regresar.',
    // Visibility
    reposition: 'Asegúrate de estar a la vista de la cámara.',
    step_back: 'Retrocede un poco para que se vea la pierna.',
    // Streaks
    streak: '¡Tres repeticiones seguidas excelentes!',
    great_rhythm: 'Llevas un ritmo excelente.',
    // Form
    knee_in: 'Mantén la rodilla alineada con el pie.',
    // Milestones
    halfway: 'Vas por la mitad. Sigue así.',
    last_rep: 'Una más.',
    final_rep: '¡Última repetición, que cuente!',
    done: 'Buen trabajo. Sesión terminada.',
    session_complete: '¡Listo! Fantástico esfuerzo hoy.',
  },
}

// Cues that may cut off whatever is playing.
const PRIORITY: CoachCue[] = ['knee_in', 'slow_down', 'reposition', 'done', 'session_complete']

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

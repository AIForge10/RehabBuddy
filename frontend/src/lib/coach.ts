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
// Rep counts are cues too, count_1 ("One.") to count_20 ("Twenty.").

import type { Exercise } from './exercises'
import type { Language } from '../types/session'

// The coach counts reps out loud up to here; past it, a rep gets encouragement instead.
const COUNT_WORDS: Record<Language, readonly string[]> = {
  en: ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'],
  es: ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez', 'Once', 'Doce', 'Trece', 'Catorce', 'Quince', 'Dieciséis', 'Diecisiete', 'Dieciocho', 'Diecinueve', 'Veinte'],
}

type CountCue = `count_${number}`

const isCount = (cue: CoachCue): cue is CountCue => cue.startsWith('count_')

/** The cue that says rep `n` out loud, or null past what the coach counts to. */
export function countCue(n: number): CoachCue | null {
  return Number.isInteger(n) && n >= 1 && n <= COUNT_WORDS.en.length ? `count_${n}` : null
}

export type CoachCue =
  | CountCue
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
  // At the target: pause there for a second (pool; Live picks one and rations them)
  | 'hold'
  | 'and_hold'
  | 'pause_there'
  | 'stay_there'
  | 'hold_a_second'
  // The patient said it hurts (lib/listen.ts)
  | 'pain_stop'

type LineCue = Exclude<CoachCue, CountCue>

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
  'hold',
  'and_hold',
  'pause_there',
  'stay_there',
  'hold_a_second',
  'pain_stop',
  ...COUNT_WORDS.en.map((_, i) => `count_${i + 1}` as const),
]

export const CUE_TEXT: Record<Language, Record<LineCue, string>> = {
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
    // Form (the knee's `cues.form` in lib/exercises.ts, which its clip says)
    knee_in: 'Keep your thigh still on the chair.',
    // Milestones
    halfway: 'Halfway there. Keep going.',
    last_rep: 'One more.',
    final_rep: 'Final rep, make it count!',
    done: 'Great work. Session complete.',
    session_complete: 'All done! Fantastic effort today.',
    // Hold at the target
    hold: 'Hold it there.',
    and_hold: 'And hold.',
    pause_there: 'Pause there for a second.',
    stay_there: 'Stay right there.',
    hold_a_second: 'Hold that for a second.',
    pain_stop: "Okay, let's stop there. I'm letting your therapist know.",
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
    knee_in: 'Mantén el muslo quieto sobre la silla.',
    // Milestones
    halfway: 'Vas por la mitad. Sigue así.',
    last_rep: 'Una más.',
    final_rep: '¡Última repetición, que cuente!',
    done: 'Buen trabajo. Sesión terminada.',
    session_complete: '¡Listo! Fantástico esfuerzo hoy.',
    // Hold at the target
    hold: 'Mantén la posición.',
    and_hold: 'Y mantén.',
    pause_there: 'Haz una pausa ahí, un segundo.',
    stay_there: 'Quédate justo ahí.',
    hold_a_second: 'Aguanta un segundo.',
    pain_stop: 'Está bien, paremos aquí. Le aviso a tu terapeuta.',
  },
}

/** The ways the coach asks for a pause at the target. Live says one of these at most every few reps. */
export const HOLD_CUES: readonly CoachCue[] = ['hold', 'and_hold', 'pause_there', 'stay_there', 'hold_a_second']

// Cues that may cut off whatever is playing. Everything else is dropped while
// the coach is talking, so a count or a "hold" never queues up to play late.
const PRIORITY: CoachCue[] = [
  'knee_in',
  'slow_down',
  'control_the_return',
  'reposition',
  'step_back',
  'done',
  'session_complete',
  'pain_stop',
]

// Audio that hasn't started by now (slow network or backend) is spoken instead.
const START_TIMEOUT_MS = 4000

// A backend-voiced line is downloaded whole before it plays, like a cue clip.
// The backend holds the download until synthesis has produced audio (up to
// 10 s), so a line gets this long to arrive before the browser reads it.
const LINE_TIMEOUT_MS = 12_000

const wait = (ms: number) => new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))

// 10 ms of silence, played inside a tap to unlock the player (see unlockAudio).
const SILENCE =
  'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA=='

const NAMED: Partial<Record<CoachCue, keyof Exercise['copy']['en']['cues']>> = { start: 'start', bend_deeper: 'bend_deeper', knee_in: 'form' }

/** A cue's clip name and caption. frontend/scripts/cue-lines.mjs reads this to list the clips to generate. */
export function cueLine(cue: CoachCue, lang: Language, exercise?: Exercise): { clip: string; text: string } {
  if (isCount(cue)) return { clip: cue, text: `${COUNT_WORDS[lang][Number(cue.slice(6)) - 1]}.` }
  const named = exercise && exercise.part !== 'knee' ? NAMED[cue] : undefined
  return named ? { clip: `${cue}_${exercise!.part}`, text: exercise!.copy[lang].cues[named] } : { clip: cue, text: CUE_TEXT[lang][cue] }
}

let player: HTMLAudioElement | null = null
const audio = () => (player ??= new Audio())
let unlocked = false
let busy = false
let busySince = 0
let quietSince = 0
let lastLine = ''
// Bumped whenever a new line takes over, so callbacks from the old one do nothing.
let turn = 0

// Chrome sometimes never fires a speech utterance's end event. No cue runs this
// long, so past it the coach stops waiting rather than stay silent for the rest
// of the session.
const STUCK_MS = 10_000

const isBusy = () => busy && performance.now() - busySince < STUCK_MS

function setBusy(on: boolean) {
  if (on) busySince = performance.now()
  else if (busy) quietSince = performance.now()
  busy = on
}

// Cue clips by path: an object URL once fetched, null if the file is missing.
const clips = new Map<string, Promise<string | null>>()

function loadClip(path: string): Promise<string | null> {
  let clip = clips.get(path)
  if (!clip) {
    clip = fetch(path)
      .then(async (r) => (r.ok && r.headers.get('content-type')?.startsWith('audio/') ? URL.createObjectURL(await r.blob()) : null))
      .catch(() => null)
      .then((url) => {
        // A line the backend couldn't voice (or a missing cue file) isn't remembered, so saying it again tries again.
        if (url == null) clips.delete(path)
        return url
      })
    clips.set(path, clip)
  }
  return clip
}

function speak(text: string, lang: Language) {
  if (!('speechSynthesis' in window)) {
    setBusy(false)
    return
  }
  const me = turn
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang === 'es' ? 'es-ES' : 'en-US'
  u.rate = 1
  // A cancelled line ends too, after the next one has started: only the current line frees the coach.
  u.onend = u.onerror = () => {
    if (me === turn) setBusy(false)
  }
  window.speechSynthesis.speak(u)
}

function play(src: string, text: string, lang: Language) {
  const me = turn
  const a = audio()
  let started = false
  let fellBack = false
  const finished = () => {
    if (me === turn) setBusy(false)
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
  setBusy(false)
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

/** Fetch every cue clip for this session up front (counts up to `reps`), so none waits on the network mid-rep. */
export function preloadCues(lang: Language, exercise: Exercise, reps = Infinity) {
  for (const cue of CUES) {
    if (isCount(cue) && Number(cue.slice(6)) > reps) continue
    loadClip(`/audio/${lang}/${cueLine(cue, lang, exercise).clip}.mp3`)
  }
}

/**
 * Speak a cue. Returns the line so the UI can show it as a caption, or null
 * when the coach is busy with another line and this one isn't worth cutting
 * it off for: it's dropped, not queued, since a late cue would be wrong.
 */
export function playCue(cue: CoachCue, lang: Language, exercise?: Exercise): string | null {
  const { clip, text } = cueLine(cue, lang, exercise)
  if (busy) {
    if (isBusy() && !PRIORITY.includes(cue)) return null
    stop()
  }
  const me = ++turn
  setBusy(true)
  lastLine = text
  loadClip(`/audio/${lang}/${clip}.mp3`).then((url) => {
    if (me !== turn) return
    if (url) play(url, text, lang)
    else speak(text, lang)
  })
  return text
}

/**
 * Free-form line (e.g. the AI pain-check reply), from `audioUrl` when the backend
 * voiced it. The audio is downloaded whole and then played from memory, the way
 * a cue clip is. Handing the backend's stream straight to <audio> starts sooner
 * in Chrome, but Safari and the iPhone app wait for the whole stream before
 * they play at all, so a longer reply ran past START_TIMEOUT_MS and the browser
 * voice read it instead of the coach's.
 */
export function sayText(text: string, lang: Language, audioUrl?: string | null) {
  stop()
  const me = turn
  setBusy(true)
  lastLine = text
  if (!audioUrl) {
    speak(text, lang)
    return
  }
  Promise.race([loadClip(audioUrl), wait(LINE_TIMEOUT_MS)]).then((url) => {
    if (me !== turn) return
    if (url) play(url, text, lang)
    else speak(text, lang)
  })
}

/** Starts downloading a backend-voiced line ahead of sayText, so it plays the moment it's due. Resolves to null if it couldn't be fetched. */
export function preloadLine(audioUrl: string): Promise<string | null> {
  return loadClip(audioUrl)
}

export function stopCoach() {
  stop()
}

/** Resolves once the coach has finished what it's saying, or after `maxMs` at most. */
export function untilCoachQuiet(maxMs = 5000): Promise<void> {
  const until = performance.now() + maxMs
  return new Promise((resolve) => {
    const check = () => (!isBusy() || performance.now() > until ? resolve() : void setTimeout(check, 100))
    check()
  })
}

/** The coach's latest line, and how long it has been quiet since (0 while it's still talking). */
export function coachLastLine(): { text: string; quietFor: number } {
  return { text: lastLine, quietFor: isBusy() ? 0 : performance.now() - quietSince }
}

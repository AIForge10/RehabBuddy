import { coachLine, VOICE_ANSWERS } from '../../api/client'
import { preloadLine, sayText } from '../../lib/coach'
import type { Exercise } from '../../lib/exercises'
import { t } from '../../lib/i18n'
import { canRecord } from '../../lib/useRecorder'
import type { Language } from '../../types/session'

// The pain check's own lines (its question, "tap a number") in the coach's
// ElevenLabs voice, like the reply. The backend voices each line once and
// replays it from its cache after that. A line is asked for ahead of time
// (warm) whenever the screen knows it's coming, so the audio is already here
// when it's due; when the voice still isn't back in time the browser reads the
// line instead, so the coach never lags behind the screen.

/** A spoken answer needs speech-to-text (not in mock mode) and a browser that can record. */
export const MIC = VOICE_ANSWERS && canRecord

/** What the coach asks as the pain check opens, in the exercise's own words. */
/** `mic`: whether the screen offers a spoken answer (off for a demo session, which has nothing to transcribe against). */
export function painQuestion(exercise: Exercise, lang: Language, stopped: boolean, mic: boolean = MIC): string {
  return t(lang).painAsk(exercise.copy[lang].painTitle, mic, stopped)
}

const VOICE_WAIT_MS = 4000

// Lines already asked for, by language and text: the backend's URL once its
// audio has been downloaded, or null when it couldn't voice the line.
const ready = new Map<string, Promise<string | null>>()

/**
 * Has the backend voice `text` now and downloads the audio, so say() plays it
 * the moment it's due. Calling it again for the same line is free. A line the
 * backend couldn't voice is forgotten, so the next ask tries again.
 */
export function warm(text: string, lang: Language): Promise<string | null> {
  const key = `${lang}\n${text}`
  let line = ready.get(key)
  if (!line) {
    line = coachLine(text, lang).then(async (url) => {
      const ok = url != null && (await preloadLine(url)) != null
      if (!ok) ready.delete(key)
      return ok ? url : null
    })
    ready.set(key, line)
  }
  return line
}

// Bumped by every line, so one still waiting for its audio is dropped when
// something else is said first (or the patient starts talking).
let turn = 0

export async function say(text: string, lang: Language) {
  const me = ++turn
  const url = await Promise.race([warm(text, lang), new Promise<null>((r) => setTimeout(() => r(null), VOICE_WAIT_MS))])
  if (me === turn) sayText(text, lang, url)
}

/** Drops a line still waiting for its audio, so it isn't said over what comes next. */
export function skipPending() {
  turn++
}

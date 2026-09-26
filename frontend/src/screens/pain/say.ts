import { coachLine } from '../../api/client'
import { sayText } from '../../lib/coach'
import type { Language } from '../../types/session'

// The pain check's own lines (its question, "tap a number") in the coach's
// ElevenLabs voice, like the reply. The backend voices each line once and
// replays it from its cache after that. When the voice isn't back quickly the
// browser reads the line instead, so the coach never lags behind the screen.

const VOICE_WAIT_MS = 2500

// Bumped by every line, so one still waiting for its audio is dropped when
// something else is said first (or the patient starts talking).
let turn = 0

export async function say(text: string, lang: Language) {
  const me = ++turn
  const url = await Promise.race([coachLine(text, lang), new Promise<null>((r) => setTimeout(() => r(null), VOICE_WAIT_MS))])
  if (me === turn) sayText(text, lang, url)
}

/** Drops a line still waiting for its audio, so it isn't said over what comes next. */
export function skipPending() {
  turn++
}

// Form warnings travel as codes: the pose engine emits them, sessions store
// them (sessions.form_warnings, one entry per occurrence). This is the one
// place that turns a code into what the coach says and what the screens show.
//   not_deep_enough, too_fast        the rep counter, on the rep that did it (pose/repCounter.ts)
//   thigh_moving, leaning_back, ...  the camera's form checks, mid-rep (pose/form.ts)
// Sessions saved before the codes hold free text ("Knee caving inward"),
// which shows as it is.
import type { CoachCue } from './coach'
import { t } from './i18n'
import type { FormFault } from '../pose/joints'
import type { RepWarning } from '../pose/repCounter'
import type { Language } from '../types/session'

export type FormWarning = RepWarning | FormFault

const CUES: Record<FormWarning, CoachCue | null> = {
  // The rep's own cue already says "bend a little deeper", judged on the same peak.
  not_deep_enough: null,
  too_fast: 'slow_down',
  // knee_in is the exercise's form line, so each fault is voiced in its own exercise's words.
  thigh_moving: 'knee_in',
  leaning_back: 'knee_in',
  elbow_drifting: 'knee_in',
  shrugging: 'knee_in',
}

const isCode = (w: string): w is FormWarning => Object.hasOwn(CUES, w)

/** The coach cue for a warning, or null when it needs none of its own. */
export function warningCue(w: string): CoachCue | null {
  return isCode(w) ? CUES[w] : null
}

/** A warning in words. Legacy free text comes back unchanged. */
export function warningLabel(w: string, lang: Language): string {
  return isCode(w) ? t(lang).formWarnings[w] : w
}

/** A session's warnings in words, each once with how often it happened, most frequent first. */
export function warningCounts(warnings: readonly string[], lang: Language): { label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const w of warnings) {
    const label = warningLabel(w, lang)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
}

/** warningCounts as short lines: "Too fast ×3", "Leaning back". */
export function warningNotes(warnings: readonly string[], lang: Language): string[] {
  return warningCounts(warnings, lang).map(({ label, count }) => (count > 1 ? `${label} ×${count}` : label))
}

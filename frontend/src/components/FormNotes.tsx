import { warningNotes } from '../lib/formWarnings'
import { useLanguage } from '../lib/language'

/**
 * A session's form warnings for a ledger row: the most frequent one, and how
 * many other kinds there were. Hover for the full list with counts.
 */
export function FormNotes({ warnings }: { warnings: readonly string[] }) {
  const { s, lang } = useLanguage()
  const notes = warningNotes(warnings, lang)
  if (!notes.length) return <span className="text-good">{s.doneFormClean}</span>
  return (
    <span className="text-warn" title={notes.join('\n')}>
      {notes[0]}
      {notes.length > 1 && <span className="text-muted"> +{notes.length - 1}</span>}
    </span>
  )
}

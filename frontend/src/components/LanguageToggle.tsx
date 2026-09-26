import { useLanguage } from '../lib/language'
import type { Language } from '../types/session'

const OPTIONS: { value: Language; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'es', label: 'ES' },
]

export function LanguageToggle() {
  const { lang, setLang } = useLanguage()
  return (
    <div role="radiogroup" aria-label="Language" className="inline-flex rounded-full border border-line bg-surface p-0.5 text-xs font-semibold">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={lang === o.value}
          onClick={() => setLang(o.value)}
          className={`rounded-full px-3 py-1 transition-colors ${
            lang === o.value ? 'bg-ink text-surface' : 'text-ink-2 hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

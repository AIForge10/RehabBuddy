import { useLanguage } from '../lib/language'
import type { Language } from '../types/session'

const OPTIONS: { value: Language; label: string; name: string }[] = [
  { value: 'en', label: 'EN', name: 'English' },
  { value: 'es', label: 'ES', name: 'Español' },
]

export function LanguageToggle({ onDark = false }: { onDark?: boolean }) {
  const { lang, setLang } = useLanguage()
  return (
    <div
      role="radiogroup"
      aria-label="Language"
      className={`relative inline-grid grid-cols-2 rounded-full p-1 text-[13px] font-bold ${
        onDark ? 'bg-white/10 ring-1 ring-white/15 backdrop-blur-xl' : 'bg-surface shadow-card ring-1 ring-line'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full transition-transform duration-300 ease-out ${
          onDark ? 'bg-white' : 'bg-brand'
        } ${lang === 'es' ? 'translate-x-full' : ''}`}
      />
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={lang === o.value}
          aria-label={o.name}
          onClick={() => setLang(o.value)}
          className={`relative z-10 h-9 w-12 rounded-full tracking-wide transition-colors duration-300 ${
            lang === o.value ? (onDark ? 'text-stage' : 'text-on-brand') : onDark ? 'text-white/70 hover:text-white' : 'text-ink-2 hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

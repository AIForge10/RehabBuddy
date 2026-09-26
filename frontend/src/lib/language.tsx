import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Language } from '../types/session'
import { t, type Strings } from './i18n'

const KEY = 'rehabbuddy.lang'

function initial(): Language {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'en' || saved === 'es') return saved
  } catch {
    /* ignore */
  }
  return 'en'
}

interface LanguageCtx {
  lang: Language
  setLang: (l: Language) => void
  s: Strings
}

const Ctx = createContext<LanguageCtx | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(initial)
  const setLang = (l: Language) => {
    setLangState(l)
    try {
      localStorage.setItem(KEY, l)
    } catch {
      /* ignore */
    }
  }
  return <Ctx.Provider value={{ lang, setLang, s: t(lang) }}>{children}</Ctx.Provider>
}

export function useLanguage(): LanguageCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useLanguage must be used inside <LanguageProvider>')
  return ctx
}

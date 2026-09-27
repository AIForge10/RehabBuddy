import { useEffect } from 'react'
import type { Language } from '../types/session'

const SITE = 'bendwith.us'

// Per screen, so a patient tab and a clinic tab open side by side can be told apart.
const TITLES: Record<string, Record<Language, string>> = {
  '/': { en: 'Home', es: 'Inicio' },
  '/session': { en: 'Session', es: 'Sesión' },
  '/pain-check': { en: 'Pain check', es: 'Dolor' },
  '/done': { en: 'Session done', es: 'Sesión terminada' },
  '/therapist': { en: 'Clinic', es: 'Clínica' },
  '/login': { en: 'Log in', es: 'Iniciar sesión' },
  '/signup': { en: 'Sign up', es: 'Crear cuenta' },
}

export function usePageTitle(pathname: string, lang: Language) {
  useEffect(() => {
    const page = TITLES[pathname]?.[lang]
    document.title = page ? `${page} · ${SITE}` : SITE
  }, [pathname, lang])
}

import type { ReactNode } from 'react'
import { Wordmark } from './Wordmark'
import { LanguageToggle } from './LanguageToggle'

/** Page frame for the patient-facing screens. */
export function PatientScreen({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-dvh">
      <header className={`mx-auto flex items-center justify-between px-5 py-4 ${wide ? 'max-w-6xl' : 'max-w-2xl'}`}>
        <Wordmark />
        <LanguageToggle />
      </header>
      <main className={`mx-auto px-5 pb-16 ${wide ? 'max-w-6xl' : 'max-w-2xl'}`}>{children}</main>
    </div>
  )
}

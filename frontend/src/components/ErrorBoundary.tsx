import { Component, type ReactNode } from 'react'
import { buttonClass, TITLE } from './Screen'

// Once per tab: a reload that fails the same way shows the screen below instead of looping.
const RELOADED_KEY = 'rehabbuddy.reloadedForChunk'

const COPY = {
  en: { title: 'Something went wrong', body: 'This screen hit an error. Reload to try again.', reload: 'Reload', home: 'Start over' },
  es: { title: 'Algo salió mal', body: 'Esta pantalla tuvo un error. Recarga para intentarlo de nuevo.', reload: 'Recargar', home: 'Empezar de nuevo' },
}

function language(): 'en' | 'es' {
  try {
    return localStorage.getItem('rehabbuddy.lang') === 'es' ? 'es' : 'en'
  } catch {
    return 'en'
  }
}

/**
 * A screen that throws would otherwise leave a blank page. A new deploy also
 * removes the old build's code chunks, so a tab opened before it can't load
 * the next screen; that case reloads once, onto the new build.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  componentDidMount() {
    // Loaded fine: a later deploy may reload this tab again.
    setTimeout(() => {
      try {
        sessionStorage.removeItem(RELOADED_KEY)
      } catch {
        /* ignore */
      }
    }, 10_000)
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    const staleChunk = /dynamically imported module|Importing a module script failed|error loading dynamically imported/i.test(message)
    try {
      if (staleChunk && !sessionStorage.getItem(RELOADED_KEY)) {
        sessionStorage.setItem(RELOADED_KEY, '1')
        window.location.reload()
      }
    } catch {
      /* no storage: show the screen */
    }
    console.error(error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    const t = COPY[language()]
    return (
      <main role="alert" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-16">
        <h1 className={TITLE}>{t.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">{t.body}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={() => window.location.reload()} className={buttonClass('primary', 'md')}>
            {t.reload}
          </button>
          <a href="/" className={buttonClass('secondary', 'md')}>
            {t.home}
          </a>
        </div>
      </main>
    )
  }
}

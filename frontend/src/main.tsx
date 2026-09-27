import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { hasAuthToken, setAuthToken } from './api/client'
import { ErrorBoundary } from './components/ErrorBoundary'
import { loadToken } from './lib/native'

// The mobile app keeps the sign-in token across launches (lib/native.ts). It
// has to be back before the first render, which decides whether someone is
// signed in. On the web loadToken() is an immediate null.
async function start() {
  const saved = await loadToken().catch(() => null)
  if (saved && !hasAuthToken()) setAuthToken(saved)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}

void start()

// "Continue with Google" through Google Identity Services. Google hands back an
// ID token; the backend checks it (POST /auth/google), so the email is already
// verified and no code is needed.
//
// Hidden when VITE_GOOGLE_CLIENT_ID is unset, in mock mode, and in the iOS/Android
// app: Google refuses sign-in inside embedded web views.

import { useEffect, useRef, useState } from 'react'
import { GOOGLE_CLIENT_ID, googleEnabled } from '../api/auth'
import { useAuth } from '../lib/auth'
import { useLanguage } from '../lib/language'
import type { Role } from '../types/session'

interface GoogleId {
  initialize(config: { client_id: string; callback: (res: { credential: string }) => void; ux_mode?: 'popup' }): void
  renderButton(el: HTMLElement, options: Record<string, string | number>): void
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } }
  }
}

let script: Promise<void> | null = null
function loadScript(): Promise<void> {
  script ??= new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = 'https://accounts.google.com/gsi/client'
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => {
      script = null
      reject(new Error('Google sign-in failed to load'))
    }
    document.head.appendChild(el)
  })
  return script
}

interface Props {
  /** The role a NEW account gets; an existing account keeps its own. */
  role: Role
  onError: () => void
  onPending?: (pending: boolean) => void
}

export default function GoogleButton({ role, onError, onPending }: Props) {
  const { googleSignIn } = useAuth()
  const { lang } = useLanguage()
  const box = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  // Google keeps the first callback it's given, so it reads the latest props through this ref.
  const latest = useRef({ role, lang, onError, onPending, googleSignIn })
  useEffect(() => {
    latest.current = { role, lang, onError, onPending, googleSignIn }
  })

  useEffect(() => {
    if (!googleEnabled) return
    let cancelled = false
    loadScript()
      .then(() => {
        const el = box.current
        const id = window.google?.accounts.id
        if (cancelled || !el || !id) return
        id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          ux_mode: 'popup',
          callback: async ({ credential }) => {
            const { role, lang, onError, onPending, googleSignIn } = latest.current
            onPending?.(true)
            try {
              // Success needs no navigation: the signed-in account makes the route redirect.
              await googleSignIn(credential, role, lang)
            } catch {
              onError()
              onPending?.(false)
            }
          },
        })
        el.replaceChildren()
        id.renderButton(el, {
          type: 'standard',
          theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          logo_alignment: 'center',
          width: Math.min(400, Math.round(el.clientWidth)),
          locale: lang,
        })
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [lang])

  if (!googleEnabled || failed) return null
  return <div ref={box} className="flex min-h-11 w-full justify-center" />
}

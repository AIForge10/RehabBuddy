// "Continue with Google" through Google Identity Services. Google hands back an
// ID token; the backend checks it (POST /auth/google), so the email is already
// verified and no code is needed.
//
// Hidden when VITE_GOOGLE_CLIENT_ID is unset and in mock mode. In the iOS/Android app
// Google refuses sign-in inside the web view, so there the button opens the phone's own
// account picker instead (lib/native.ts) and hands the same ID token to the backend.

import { useEffect, useRef, useState } from 'react'
import { GOOGLE_CLIENT_ID, googleEnabled } from '../api/auth'
import { useAuth } from '../lib/auth'
import { useLanguage } from '../lib/language'
import { isNativeApp, nativeGoogleSignIn } from '../lib/native'
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

export default function GoogleButton(props: Props) {
  if (!googleEnabled) return null
  return isNativeApp ? <NativeGoogleButton {...props} /> : <WebGoogleButton {...props} />
}

function NativeGoogleButton({ role, onError, onPending }: Props) {
  const { googleSignIn } = useAuth()
  const { s, lang } = useLanguage()
  const [busy, setBusy] = useState(false)

  const signIn = async () => {
    setBusy(true)
    onPending?.(true)
    try {
      const credential = await nativeGoogleSignIn()
      // null: the picker was closed. Success needs no navigation: the route redirects.
      if (credential) return void (await googleSignIn(credential, role, lang))
    } catch {
      onError()
    }
    setBusy(false)
    onPending?.(false)
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void signIn()}
      className="flex min-h-11 w-full items-center justify-center gap-3 rounded-full bg-surface px-5 py-2.5 font-semibold ring-1 ring-line-strong transition-[box-shadow,transform] duration-200 hover:ring-2 hover:ring-brand-ink active:scale-[0.98] disabled:opacity-60"
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      {s.continueGoogle}
    </button>
  )
}

function WebGoogleButton({ role, onError, onPending }: Props) {
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
        const width = Math.min(400, Math.round(el.clientWidth))
        id.renderButton(el, {
          ...(width >= 200 && { width }),   // Google's minimum; without it the button sizes itself
          type: 'standard',
          theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          logo_alignment: 'center',
          locale: lang,
        })
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [lang])

  if (failed) return null
  return <div ref={box} className="flex min-h-11 w-full justify-center" />
}

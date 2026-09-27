import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import * as api from '../api/auth'
import type { Account } from '../api/auth'
import { onUnauthorized } from '../api/client'
import type { Role } from '../types/session'

interface AuthCtx {
  account: Account | null
  /** The backend rejected the token mid-session, so the next stop is the log-in page. */
  expired: boolean
  signIn: typeof api.signIn
  signUp: typeof api.signUp
  demoSignIn: typeof api.demoSignIn
  googleSignIn: typeof api.googleSignIn
  signOut: () => void
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(api.currentAccount)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    onUnauthorized(() => {
      api.signOut()
      setExpired(true)
      setAccount(null)
    })
    return () => onUnauthorized(() => {})
  }, [])

  const value: AuthCtx = {
    account,
    expired,
    signIn: async (email, password) => {
      const a = await api.signIn(email, password)
      setAccount(a)
      return a
    },
    signUp: async (input) => {
      const a = await api.signUp(input)
      setAccount(a)
      return a
    },
    demoSignIn: async (role) => {
      const a = await api.demoSignIn(role)
      setAccount(a)
      return a
    },
    googleSignIn: async (credential, role, language) => {
      const a = await api.googleSignIn(credential, role, language)
      setAccount(a)
      return a
    },
    signOut: () => {
      api.signOut()
      setExpired(false)
      setAccount(null)
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Where each role lands after signing in. */
export const homeFor = (role: Role) => (role === 'therapist' ? '/therapist' : '/')

/** Signed-in only, and only for `role`. Visitors go to the splash (an expired session to log in); the wrong role goes to its own home. */
export function RequireAuth({ role, children }: { role: Role; children: ReactNode }) {
  const { account, expired } = useAuth()
  if (!account) return <Navigate to={expired ? '/login' : '/welcome'} replace />
  if (account.role !== role) return <Navigate to={homeFor(account.role)} replace />
  return children
}

/** Splash, log in and sign up: a signed-in visitor goes straight to their home. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { account } = useAuth()
  if (account) return <Navigate to={homeFor(account.role)} replace />
  return children
}

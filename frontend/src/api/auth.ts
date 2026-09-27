// Accounts, sign-in and sign-up. The Account shape is the `profiles` row
// (id, full_name, role, language) plus the email.
//
// Real backend: signIn posts to /auth/login and signUp to /auth/signup; both
// hand the bearer token to client.ts, which sends it on every call
// (docs/AUTH.md). The demo buttons log in as the seeded demo accounts.
//
// Mock mode (VITE_USE_MOCKS=true): a FRONTEND-ONLY STAND-IN. Accounts live in
// this browser's localStorage and every account plays the demo data: a patient
// account sees VITE_DEMO_PATIENT_ID's plan, a therapist account sees
// VITE_DEMO_THERAPIST_ID's caseload.
//
// The signed-in account is kept per tab (sessionStorage) and remembered for new
// tabs (localStorage), so one machine can run the patient tab and the therapist
// tab side by side for the demo. The real backend's token is per tab, so a new
// tab there logs in again.

import type { Language, LoginResponse, Role, SignupRequest, UUID } from '../types/session'
import { isNativeApp } from '../lib/native'
import { ApiError, DEMO_PATIENT_ID, DEMO_THERAPIST_ID, USE_MOCKS, googleLogin, hasAuthToken, login, setAuthToken, signup } from './client'

export interface Account {
  id: UUID
  full_name: string
  email: string
  role: Role
  language: Language
}

interface StoredAccount extends Account {
  password_hash: string
}

const ACCOUNTS_KEY = 'rehabbuddy.accounts.v1'
const SESSION_KEY = 'rehabbuddy.session.v1'

/** One-tap demo accounts on the log-in page. Emails match the seeded `profiles` rows. */
export const DEMO_ACCOUNTS: Record<Role, Account> = {
  patient: { id: DEMO_PATIENT_ID, full_name: 'Maria Lopez', email: 'maria@bendwith.us', role: 'patient', language: 'es' },
  therapist: { id: DEMO_THERAPIST_ID, full_name: 'Dr. Lee', email: 'lee@bendwith.us', role: 'therapist', language: 'en' },
}

/** Shared by every seeded demo account (docs/AUTH.md); not a secret. */
const DEMO_PASSWORD = 'demo1234'

/** Machine-readable failure; screens map it to translated copy. */
export class AuthError extends Error {
  code: 'invalid' | 'taken' | 'unverified'
  constructor(code: 'invalid' | 'taken' | 'unverified') {
    super(code)
    this.code = code
  }
}

function read<T>(store: Storage, key: string): T | null {
  try {
    const raw = store.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(store: Storage, key: string, value: unknown) {
  try {
    if (value == null) store.removeItem(key)
    else store.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode or full: the session just won't persist */
  }
}

const accounts = () => read<StoredAccount[]>(localStorage, ACCOUNTS_KEY) ?? []
const normalise = (email: string) => email.trim().toLowerCase()

async function hash(email: string, password: string): Promise<string> {
  const input = `${normalise(email)}:${password}`
  // crypto.subtle only exists on secure origins; plain-http LAN demos fall back
  // to FNV-1a. Neither is real security: that's the backend's job.
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 0x01000193)
  return `fnv:${(h >>> 0).toString(16)}`
}

const publicPart = (a: StoredAccount): Account => ({ id: a.id, full_name: a.full_name, email: a.email, role: a.role, language: a.language })

// A beat of latency so the pending state is visible and the swap to a real
// network call doesn't change how the screens feel.
const settle = () => new Promise((r) => setTimeout(r, 450))

export function currentAccount(): Account | null {
  if (!USE_MOCKS && !hasAuthToken()) return null
  return read<Account>(sessionStorage, SESSION_KEY) ?? read<Account>(localStorage, SESSION_KEY)
}

function remember(account: Account | null) {
  write(sessionStorage, SESSION_KEY, account)
  write(localStorage, SESSION_KEY, account)
}

/** Keeps the token and the account from a login or sign-up response. */
function start(res: LoginResponse, email: string): Account {
  setAuthToken(res.access_token)
  const account: Account = { ...res.user, email }
  remember(account)
  return account
}

async function backendSignIn(email: string, password: string): Promise<Account> {
  try {
    return start(await login({ email: normalise(email), password }), normalise(email))
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) throw new AuthError('invalid')
    // Right password but the email isn't confirmed yet (OTP on): the backend has just emailed a code.
    if (err instanceof ApiError && err.status === 403) throw new AuthError('unverified')
    throw err
  }
}

async function backendSignUp(input: SignupRequest): Promise<Account> {
  const email = normalise(input.email)
  try {
    return start(await signup({ ...input, full_name: input.full_name.trim(), email }), email)
  } catch (err) {
    throw err instanceof ApiError && err.status === 409 ? new AuthError('taken') : err
  }
}

export async function signIn(email: string, password: string): Promise<Account> {
  if (!USE_MOCKS) return backendSignIn(email, password)
  await settle()
  const found = accounts().find((a) => a.email === normalise(email))
  if (!found || found.password_hash !== (await hash(email, password))) throw new AuthError('invalid')
  const account = publicPart(found)
  remember(account)
  return account
}

export async function signUp(input: SignupRequest): Promise<Account> {
  if (!USE_MOCKS) return backendSignUp(input)
  await settle()
  const email = normalise(input.email)
  const list = accounts()
  if (list.some((a) => a.email === email) || Object.values(DEMO_ACCOUNTS).some((a) => a.email === email)) throw new AuthError('taken')
  const stored: StoredAccount = {
    id: input.role === 'patient' ? DEMO_PATIENT_ID : DEMO_THERAPIST_ID,
    full_name: input.full_name.trim(),
    email,
    role: input.role,
    language: input.language,
    password_hash: await hash(email, input.password),
  }
  write(localStorage, ACCOUNTS_KEY, [...list, stored])
  const account = publicPart(stored)
  remember(account)
  return account
}

/** The web client id from Google Cloud. Unset: the Google button is hidden. */
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

/** Off in mock mode, and in the iOS/Android app: Google refuses sign-in inside embedded web views. */
export const googleEnabled = Boolean(GOOGLE_CLIENT_ID) && !USE_MOCKS && !isNativeApp

/**
 * "Sign in with Google": the backend checks Google's ID token, so the email is
 * already verified and no code is needed. `role` only applies to a new account.
 */
export async function googleSignIn(credential: string, role: Role, language: Language): Promise<Account> {
  // The token's middle part is Google's claims; we only read the email for display.
  // The backend is what verifies the signature.
  const claims = JSON.parse(atob(credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { email: string }
  return start(await googleLogin({ credential, role, language }), normalise(claims.email))
}

export async function demoSignIn(role: Role): Promise<Account> {
  if (!USE_MOCKS) return backendSignIn(DEMO_ACCOUNTS[role].email, DEMO_PASSWORD)
  await settle()
  remember(DEMO_ACCOUNTS[role])
  return DEMO_ACCOUNTS[role]
}

export function signOut() {
  setAuthToken(null)
  remember(null)
}

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1').replace(/\/$/, '')

export type AuthUser = Account

/**
 * Creates the account. The backend either signs it in at once (OTP off: `account`
 * is set) or emails a code first (OTP on: show OtpStep for `email`).
 */
export async function signupStart(input: SignupRequest): Promise<{ email: string; account?: Account }> {
  if (USE_MOCKS) {
    return { email: input.email, account: await signUp(input) }
  }
  const email = normalise(input.email)
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, full_name: input.full_name.trim(), email }),
  })
  if (res.status === 409) throw new AuthError('taken')
  if (res.status === 422) throw new Error('Please check your details (password: 8+ characters)')
  if (res.status === 502 || res.status === 503) throw new Error("Couldn't send the code. Try again in a minute")
  if (!res.ok) throw new Error(`Sign-up failed (${res.status})`)
  if (res.status === 202) return { email }   // OTP on: the code is on its way
  return { email, account: start((await res.json()) as LoginResponse, email) }
}

export async function verifyOtp(email: string, code: string): Promise<Account> {
  const res = await fetch(`${API_URL}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
  })
  if (res.status === 429) throw new Error('Too many attempts. Request a new code')
  if (!res.ok) throw new Error('That code is wrong or has expired')
  const data = (await res.json()) as LoginResponse
  setAuthToken(data.access_token)
  const account: Account = {
    id: data.user.id,
    full_name: data.user.full_name,
    email: email.trim().toLowerCase(),
    role: data.user.role,
    language: data.user.language,
  }
  remember(account)
  return account
}

export async function resendOtp(email: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/resend-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  })
  if (res.status === 429) throw new Error('Please wait a minute before asking for a new code')
  if (!res.ok) throw new Error(`Couldn't send a new code (${res.status})`)
}


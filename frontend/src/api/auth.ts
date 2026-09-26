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
import { ApiError, DEMO_PATIENT_ID, DEMO_THERAPIST_ID, USE_MOCKS, hasAuthToken, login, setAuthToken, signup } from './client'

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
  code: 'invalid' | 'taken'
  constructor(code: 'invalid' | 'taken') {
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
    throw err instanceof ApiError && err.status === 401 ? new AuthError('invalid') : err
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

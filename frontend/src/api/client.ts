// Every backend call goes through this file. Screens never call fetch() directly.
//
// Modes:
//   VITE_USE_MOCKS=true  → no network; uses the in-browser mock backend (src/api/mock.ts).
//                          State lives in localStorage, so a patient tab and a
//                          therapist tab on the same machine see the same data.
//   otherwise            → real FastAPI backend at VITE_API_URL, signed in with a
//                          bearer token from POST /auth/login (docs/AUTH.md).
//
// Plan rule: "every AI call needs a fallback response so a quota error never
// breaks the demo". painCheck / getSummary / translate therefore never throw;
// they fall back to a local template if the backend call fails.

import type {
  AngleSampleRow,
  Assignment,
  CreateSessionRequest,
  CreateSessionResponse,
  DashboardResponse,
  Language,
  LoginRequest,
  LoginResponse,
  PainCheckRequest,
  PainCheckResponse,
  PatientOverview,
  SignupRequest,
  SummaryResponse,
  TranslateResponse,
  UpdateAssignmentRequest,
  UUID,
  WeeklyRecapResponse,
} from '../types/session'
import { saveToken } from '../lib/native'
import { mockBackend, fallbackPainCheck, fallbackSummary, fallbackWeeklyRecap } from './mock'
import type { PlanSuggestion } from '../types/session'
import { suggestPlan } from '../lib/plan'

/** Includes the backend's /api/v1 prefix (backend/api/core/config.py API_V1_STR). */
const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1').replace(/\/$/, '')
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

export const DEMO_PATIENT_ID: UUID = import.meta.env.VITE_DEMO_PATIENT_ID ?? 'p-maria'
export const DEMO_THERAPIST_ID: UUID = import.meta.env.VITE_DEMO_THERAPIST_ID ?? 't-lee'

const TIMEOUT_MS = 10_000

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// --- Auth token --------------------------------------------------------------
// Kept in memory and in sessionStorage, so it survives a reload but not the tab.
// The mobile app also keeps it in the Keychain/Keystore (lib/native.ts), and
// main.tsx puts it back here before the first render.

const TOKEN_KEY = 'rehabbuddy.token.v1'

let token: string | null = (() => {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
})()

let unauthorized = () => {}

export const hasAuthToken = () => token != null

export function setAuthToken(next: string | null) {
  token = next
  void saveToken(next)
  try {
    if (next) sessionStorage.setItem(TOKEN_KEY, next)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private mode: the token lives in memory only */
  }
}

/** Runs when the backend rejects the token (expired or revoked); the token is already cleared. */
export function onUnauthorized(fn: () => void) {
  unauthorized = fn
}

// Live sessions (src/api/live.ts) hold their own long-lived connections, a
// WebSocket and a streamed fetch, rather than going through request().
export { API_URL }
export const getAuthToken = () => token

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...init?.headers,
      },
      signal: controller.signal,
    })
    if (res.status === 401 && token) {
      setAuthToken(null)
      unauthorized()
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new ApiError(res.status, body || res.statusText)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) })

/** Throws ApiError 401 on a wrong email or password. */
export function login(body: LoginRequest): Promise<LoginResponse> {
  return post<LoginResponse>('/auth/login', body)
}

/** Throws ApiError 409 when the email already has an account. */
export function signup(body: SignupRequest): Promise<LoginResponse> {
  return post<LoginResponse>('/auth/signup', body)
}

// --- Data endpoints (throw on failure; screens show an error state) ---------

export function getAssignment(patientId: UUID): Promise<Assignment> {
  if (USE_MOCKS) return mockBackend.getAssignment(patientId)
  return request<Assignment>(`/patients/${patientId}/assignment`)
}

/** Patient home + session-done screens: same per-patient shape as the dashboard. */
export function getPatientOverview(patientId: UUID): Promise<PatientOverview> {
  if (USE_MOCKS) return mockBackend.getPatientOverview(patientId)
  return request<PatientOverview>(`/patients/${patientId}/overview`)
}

export function createSession(body: CreateSessionRequest): Promise<CreateSessionResponse> {
  if (USE_MOCKS) return mockBackend.createSession(body)
  return post<CreateSessionResponse>('/sessions', body)
}

export function getDashboard(therapistId: UUID): Promise<DashboardResponse> {
  if (USE_MOCKS) return mockBackend.getDashboard(therapistId)
  return request<DashboardResponse>(`/therapist/${therapistId}/dashboard`)
}

/** A session's angle trace, oldest first, for the therapist's replay. */
export function getSessionSamples(sessionId: UUID): Promise<AngleSampleRow[]> {
  if (USE_MOCKS) return mockBackend.getSessionSamples(sessionId)
  return request<AngleSampleRow[]>(`/sessions/${sessionId}/samples`)
}

/** Therapist changes a patient's plan; resolves to the saved assignment. */
export function updateAssignment(assignmentId: UUID, body: UpdateAssignmentRequest): Promise<Assignment> {
  if (USE_MOCKS) return mockBackend.updateAssignment(assignmentId, body)
  return request<Assignment>(`/assignments/${assignmentId}`, { method: 'PATCH', body: JSON.stringify(body) })
}

// --- AI endpoints (never throw; template fallback) --------------------------

export async function painCheck(body: PainCheckRequest): Promise<PainCheckResponse> {
  if (USE_MOCKS) return mockBackend.painCheck(body)
  try {
    const res = await post<PainCheckResponse>('/pain-check', body)
    // audio_url is a path from the API's origin (/api/v1/tts/…), not from API_URL.
    return res.audio_url ? { ...res, audio_url: new URL(res.audio_url, API_URL).href } : res
  } catch (err) {
    console.warn('[api] /pain-check failed, using fallback', err)
    return fallbackPainCheck(body)
  }
}

export async function getSummary(patientId: UUID): Promise<SummaryResponse> {
  if (USE_MOCKS) return mockBackend.getSummary(patientId)
  try {
    return await post<SummaryResponse>('/summary', { patient_id: patientId })
  } catch (err) {
    console.warn('[api] /summary failed, using fallback', err)
    return fallbackSummary()
  }
}

/** The coach's recap of the patient's last 7 days. Takes the overview already on screen, for the template fallback. */
export async function getWeeklyRecap(overview: PatientOverview, language: Language): Promise<WeeklyRecapResponse> {
  if (USE_MOCKS) return mockBackend.getWeeklyRecap(overview.patient.id, language)
  try {
    const res = await request<WeeklyRecapResponse>(`/patients/${overview.patient.id}/weekly-recap?language=${language}`)
    // audio_url is a path from the API's origin, as in painCheck.
    return res.audio_url ? { ...res, audio_url: new URL(res.audio_url, API_URL).href } : res
  } catch (err) {
    console.warn('[api] /weekly-recap failed, using fallback', err)
    return fallbackWeeklyRecap(overview, language)
  }
}

export async function translate(text: string, target: Language): Promise<TranslateResponse> {
  if (USE_MOCKS || target === 'en') return { text }
  try {
    return await post<TranslateResponse>('/translate', { text, target_language: target })
  } catch (err) {
    console.warn('[api] /translate failed, using original text', err)
    return { text }
  }
}

/**
 * The copilot's suggested next step for a patient's plan (their therapist only).
 * It changes nothing: approving it goes through updateAssignment. Takes the
 * overview already on screen, so the rules can suggest one if the backend fails.
 */
export async function getPlanSuggestion(overview: PatientOverview): Promise<PlanSuggestion> {
  if (USE_MOCKS) return mockBackend.getPlanSuggestion(overview.patient.id)
  try {
    return await post<PlanSuggestion>(`/patients/${overview.patient.id}/plan-suggestion`, {})
  } catch (err) {
    console.warn('[api] /plan-suggestion failed, using the rules', err)
    return suggestPlan(overview)
  }
}

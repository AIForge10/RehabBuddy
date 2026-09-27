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
// they fall back to a local template if the backend call fails (getSummary to
// null, so the dashboard keeps the summary it already shows).

import type {
  AngleSampleRow,
  Assignment,
  CreateSessionRequest,
  CreateSessionResponse,
  DashboardResponse,
  Joint,
  Language,
  LoginRequest,
  LoginResponse,
  PainCheckRequest,
  PainCheckResponse,
  PainTranscriptResponse,
  CoachLineResponse,
  PatientOverview,
  Role,
  SignupRequest,
  SummaryResponse,
  TranslateResponse,
  UpdateAssignmentRequest,
  UUID,
  WeeklyRecapResponse,
  StorageStats,
} from '../types/session'
import { saveToken } from '../lib/native'
import { mockBackend, fallbackPainCheck, fallbackWeeklyRecap } from './mock'
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

async function request<T>(path: string, init?: RequestInit, timeoutMs = TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
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

/**
 * Signs in with Google's ID token from the "Sign in with Google" button. A new
 * email becomes an account with `role`; an existing one just logs in.
 */
export function googleLogin(body: { credential: string; role: Role; language: Language }): Promise<LoginResponse> {
  return post<LoginResponse>('/auth/google', body)
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

/**
 * Patient home + session-done screens: same per-patient shape as the dashboard.
 * `joint` omitted reads the prescribed exercise's history; pass one of the overview's
 * joints_with_history to read another exercise the patient has done.
 */
export function getPatientOverview(patientId: UUID, joint?: Joint): Promise<PatientOverview> {
  if (USE_MOCKS) return mockBackend.getPatientOverview(patientId, joint)
  const qs = joint ? `?joint=${encodeURIComponent(joint)}` : ''
  return request<PatientOverview>(`/patients/${patientId}/overview${qs}`)
}

// Saving a finished session is the one request a patient can't simply redo: it
// carries every angle frame (a few hundred KB on a long session), so it gets
// longer to upload over venue wifi, and two more tries after a network error,
// a timeout or a server error. The backend keeps one session per start time,
// so a retry after a save that did land (only the reply was lost) returns that
// session instead of saving a second.
const SAVE_TIMEOUT_MS = 20_000
const SAVE_TRIES = 3

export async function createSession(body: CreateSessionRequest): Promise<CreateSessionResponse> {
  if (USE_MOCKS) return mockBackend.createSession(body)
  const json = JSON.stringify(body)
  for (let attempt = 1; ; attempt++) {
    try {
      return await request<CreateSessionResponse>('/sessions', { method: 'POST', body: json }, SAVE_TIMEOUT_MS)
    } catch (err) {
      const retry = !(err instanceof ApiError) || err.status >= 500
      if (!retry || attempt >= SAVE_TRIES) throw err
      console.warn(`[api] saving the session failed (try ${attempt} of ${SAVE_TRIES}), trying again`, err)
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
}

export function getDashboard(therapistId: UUID): Promise<DashboardResponse> {
  if (USE_MOCKS) return mockBackend.getDashboard(therapistId)
  return request<DashboardResponse>(`/therapist/${therapistId}/dashboard`)
}

/** What Tiger Data holds and how fast it answers, for the dashboard's Data card. */
export function getStorageStats(therapistId: UUID): Promise<StorageStats> {
  if (USE_MOCKS) return mockBackend.getStorageStats(therapistId)
  return request<StorageStats>(`/therapist/${therapistId}/storage`)
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

/**
 * Whether the pain check can take a spoken answer. Mock mode has no speech-to-text, so the mic is hidden there.
 * The iOS and Android apps ask for the microphone (NSMicrophoneUsageDescription, RECORD_AUDIO in mobile/), so they take one too.
 */
export const VOICE_ANSWERS = !USE_MOCKS

/**
 * The patient's spoken pain answer (a MediaRecorder clip, sent as the raw body
 * with its own type) → what they said, and the score and symptoms in it.
 * Throws: there's no template for what someone said, so the screen tells them
 * it didn't catch that and they tap instead. The audio isn't stored anywhere.
 */
export function transcribePain(sessionId: UUID, audio: Blob, language: Language): Promise<PainTranscriptResponse> {
  if (USE_MOCKS) return Promise.reject(new ApiError(501, 'No speech-to-text in mock mode'))
  return request<PainTranscriptResponse>(`/pain-check/transcribe?session_id=${encodeURIComponent(sessionId)}&language=${language}`, {
    method: 'POST',
    body: audio,
    headers: { 'Content-Type': audio.type || 'audio/webm' },
  })
}

/** A pain-check line (its question) in the coach's ElevenLabs voice. null → browser speech; never throws. */
export async function coachLine(text: string, language: Language): Promise<string | null> {
  if (USE_MOCKS) return null
  try {
    const { audio_url } = await post<CoachLineResponse>('/pain-check/speak', { text, language })
    // A path from the API's origin, as in painCheck.
    return audio_url ? new URL(audio_url, API_URL).href : null
  } catch (err) {
    console.warn('[api] /pain-check/speak failed, using browser speech', err)
    return null
  }
}

/** A freshly written summary, or null when the request failed: the one already on screen is better than none. */
export async function getSummary(patientId: UUID): Promise<SummaryResponse | null> {
  if (USE_MOCKS) return mockBackend.getSummary(patientId)
  try {
    return await post<SummaryResponse>('/summary', { patient_id: patientId })
  } catch (err) {
    console.warn('[api] /summary failed, keeping the summary shown', err)
    return null
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

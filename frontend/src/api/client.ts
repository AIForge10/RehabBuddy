// Every backend call goes through this file. Screens never call fetch() directly.
//
// Modes:
//   VITE_USE_MOCKS=true  → no network; uses the in-browser mock backend (src/api/mock.ts).
//                          State lives in localStorage, so a patient tab and a
//                          therapist tab on the same machine see the same data.
//     + VITE_LIVE_AI=true → same, except the pain check goes to the real backend
//                          (Gemini reply + ElevenLabs voice). Data stays mocked.
//   otherwise            → real FastAPI backend at VITE_API_URL.
//
// Plan rule: "every AI call needs a fallback response so a quota error never
// breaks the demo". painCheck / getSummary / translate therefore never throw;
// they fall back to a local template if the backend call fails.

import type {
  Assignment,
  CreateSessionRequest,
  CreateSessionResponse,
  DashboardResponse,
  Language,
  PainCheckRequest,
  PainCheckResponse,
  PatientOverview,
  SummaryResponse,
  TranslateResponse,
  UUID,
} from '../types/session'
import { mockBackend, fallbackPainCheck, fallbackSummary } from './mock'

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')
/** Every backend route is mounted under this (backend/api/core/config.py API_V1_STR). */
const API_PREFIX = '/api/v1'
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'
const LIVE_AI = import.meta.env.VITE_LIVE_AI === 'true'

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${API_URL}${API_PREFIX}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      signal: controller.signal,
    })
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

// --- AI endpoints (never throw; template fallback) --------------------------

export async function painCheck(body: PainCheckRequest): Promise<PainCheckResponse> {
  if (USE_MOCKS && !LIVE_AI) return mockBackend.painCheck(body)
  let res: PainCheckResponse
  try {
    res = await post<PainCheckResponse>('/pain-check', body)
    if (res.audio_url) res = { ...res, audio_url: `${API_URL}${res.audio_url}` }
  } catch (err) {
    console.warn('[api] /pain-check failed, using fallback', err)
    res = fallbackPainCheck(body)
  }
  if (USE_MOCKS) mockBackend.recordPainCheck(body, res)
  return res
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

export async function translate(text: string, target: Language): Promise<TranslateResponse> {
  if (USE_MOCKS || target === 'en') return { text }
  try {
    return await post<TranslateResponse>('/translate', { text, target_language: target })
  } catch (err) {
    console.warn('[api] /translate failed, using original text', err)
    return { text }
  }
}

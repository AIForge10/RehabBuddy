// Shared data contracts for RehabBuddy.
//
// DRAFT for the contracts call. Field names are snake_case so they match the
// FastAPI/Pydantic models and the Tiger Data columns 1:1 (no mapping layer).
//
// Angle convention (agree once, use everywhere):
//   angle = knee FLEXION in degrees = 180 - θ, where θ is the hip-knee-ankle
//   angle. Straight leg ≈ 0°, a 90° knee bend = 90°. Bigger = deeper bend.

export type Language = 'en' | 'es'
export type Role = 'patient' | 'therapist'
export type ISODateString = string
export type UUID = string

// ---------------------------------------------------------------------------
// Contract 1 — Session result (Satyabrata → Daniel)
// What src/pose/ hands the ExerciseSession screen when the patient hits "Finish".
// ---------------------------------------------------------------------------

export interface AngleSample {
  /** Milliseconds since the session started (backend converts to TIMESTAMPTZ). */
  t_ms: number
  /** Knee flexion in degrees, already smoothed (last-5-frame average). */
  angle: number
}

export interface SessionResult {
  reps_done: number
  /** Deepest flexion reached in the session, degrees. */
  max_angle: number
  /** Human-readable form cues triggered, e.g. "Knee caving inward". One entry per occurrence. */
  form_warnings: string[]
  duration_sec: number
  /** Downsampled angle trace (~10 Hz) → angle_samples hypertable. */
  samples: AngleSample[]
}

/** Live values the pose hook exposes every frame while tracking. */
export interface LivePoseState {
  /** Current smoothed flexion in degrees, or null when the leg isn't visible. */
  angle: number | null
  reps: number
  /** Latest form cue, null when form is fine. */
  form_warning: string | null
  /** Pose detection confidence 0–1. */
  confidence: number
}

// ---------------------------------------------------------------------------
// Contract 2 — API shapes (Luis ↔ Daniel)
// ---------------------------------------------------------------------------

export interface Exercise {
  id: UUID
  name: string
  joint: string
  instructions: string
}

export interface Assignment {
  id: UUID
  patient_id: UUID
  therapist_id: UUID
  exercise: Exercise
  target_angle: number
  reps: number
  times_per_week: number
}

export interface Patient {
  id: UUID
  full_name: string
  language: Language
  injury: string
  start_date: ISODateString
}

// POST /sessions
export interface CreateSessionRequest extends SessionResult {
  assignment_id: UUID
  patient_id: UUID
  started_at: ISODateString
  /** Joint the session worked ('knee', 'hip', 'shoulder', 'elbow', 'wrist'). The
   *  patient can try a joint other than the assigned one, so the backend keeps
   *  each joint's sessions apart; omitted means the assignment's own joint. */
  joint?: string
}
export interface CreateSessionResponse {
  session_id: UUID
}

// POST /pain-check
export interface PainCheckRequest {
  session_id: UUID
  pain_score: number // 1–10
  notes: string
  language: Language
}
export interface PainCheckResponse {
  flagged: boolean
  /** Short spoken/written reply from the coach, in the requested language. */
  reply: string
  /** Why it was flagged (for the therapist), null if not flagged. */
  flag_reason: string | null
  /**
   * Where `reply` streams as speech (GET, audio/mpeg). The backend sends a path
   * from the API origin; client.ts makes it absolute. null → browser speech.
   */
  audio_url: string | null
}

// POST /summary
export interface SummaryRequest {
  patient_id: UUID
}
export interface SummaryResponse {
  summary_text: string
  week_start: ISODateString
  /** true when Gemini failed and the backend returned the template fallback. */
  is_fallback: boolean
}

// POST /translate
export interface TranslateRequest {
  text: string
  target_language: Language
}
export interface TranslateResponse {
  text: string
}

// GET /therapist/{therapist_id}/dashboard  → DashboardResponse
// GET /patients/{patient_id}/overview       → PatientOverview (patient home screen)
export interface SessionRecord {
  id: UUID
  patient_id: UUID
  started_at: ISODateString
  reps_done: number
  max_angle: number
  form_warnings: string[]
  duration_sec: number
  pain_score: number | null
  flagged: boolean
  /** See CreateSessionRequest.joint. */
  joint?: string
}

export interface RedFlag {
  session_id: UUID
  patient_id: UUID
  created_at: ISODateString
  pain_score: number
  reason: string
}

export interface PatientOverview {
  patient: Patient
  assignment: Assignment
  // sessions, adherence and summary cover the assignment's joint only.
  /** Sessions in the last 7 days / assignment.times_per_week, 0–1 (can exceed 1). */
  adherence_7d: number
  /** Most recent first. */
  sessions: SessionRecord[]
  red_flags: RedFlag[]
  latest_summary: string | null
}

export interface DashboardResponse {
  therapist_id: UUID
  patients: PatientOverview[]
  generated_at: ISODateString
}

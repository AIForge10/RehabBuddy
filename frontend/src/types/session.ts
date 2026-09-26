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

/** A point on the live on-screen trace. */
export interface AngleSample {
  /** Milliseconds since the session started. */
  t_ms: number
  /** Joint angle in degrees, already smoothed (see src/pose/tracker.ts). */
  angle: number
}

/** One row of the angle_samples hypertable; the backend adds session_id. */
export interface AngleSampleRow {
  time: ISODateString
  angle: number
}

export interface SessionResult {
  reps_done: number
  /** Deepest flexion reached in the session, degrees. */
  max_angle: number
  /** Form warning codes, e.g. "too_fast" (lib/formWarnings.ts has them all). One entry per occurrence.
   *  Sessions saved before the codes may hold free text. */
  form_warnings: string[]
  duration_sec: number
  /** Every tracked frame, from the pose engine's finish() → angle_samples hypertable. */
  angle_samples: AngleSampleRow[]
}

/** Live values the pose hook exposes every frame while tracking. */
export interface LivePoseState {
  /** Current smoothed flexion in degrees, or null when the leg isn't visible. */
  angle: number | null
  reps: number
  /** Warning codes on the latest completed rep ("not_deep_enough", "too_fast"); replaced when the next rep lands. */
  rep_warnings: string[]
  /** Form fault code the camera sees right now (e.g. "leaning_back"), null when form is fine. */
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

// PATCH /assignments/{assignment_id}  → Assignment
// The therapist edits the plan. Every field is sent, changed or not.
export interface UpdateAssignmentRequest {
  /** Switches the exercise to this joint's ('knee', 'hip', …); the backend looks up its exercise row. */
  joint: string
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
   *  each joint's sessions apart. */
  joint: string
}
export interface CreateSessionResponse {
  session_id: UUID
}

// POST /auth/login
export interface LoginRequest {
  email: string
  password: string
}
export interface LoginResponse {
  access_token: string
  token_type: 'bearer'
  user: { id: UUID; full_name: string; role: Role; language: Language }
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
  /** From the session's angle_samples; null when no trace was recorded. Only on overview sessions. */
  stats?: SessionStats | null
}

/**
 * Worked out in SQL over every angle sample (backend/api/data/queries.py
 * SESSION_STATS), or by lib/replay.ts sessionStats in mock mode, on the same
 * 10 Hz trace and with the same rep thresholds as the replay.
 */
export interface SessionStats {
  /** Each complete rep's peak, in order, whole degrees. */
  rep_peaks: number[]
  /** First 3 reps' average peak minus the last 3's, degrees; positive = the later reps fell short. null under 6 reps. */
  fade: number | null
  /** Seconds within 5° of the session's deepest bend. */
  end_range_sec: number
  /** The longest unbroken stretch of end_range_sec. */
  longest_hold_sec: number
}

// GET /sessions/{session_id}/samples → AngleSampleRow[]
// The session's angle_samples rows, oldest first, for the therapist's replay.

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

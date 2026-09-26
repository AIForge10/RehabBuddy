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
  /** null for a patient who signed up themselves, until their therapist records it. */
  injury: string | null
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

// POST /auth/signup → LoginResponse (201). 409 when the email already has an account.
// A new patient starts on seated knee bends in the demo therapist's caseload.
export interface SignupRequest {
  full_name: string
  email: string
  password: string
  role: Role
  language: Language
}

// POST /pain-check
export interface PainCheckRequest {
  session_id: UUID
  pain_score: number // 1–10
  notes: string
  language: Language
  /** The patient stopped the session mid-way because it hurt: flagged for the therapist whatever the score. */
  stopped_for_pain?: boolean
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

// POST /pain-check/transcribe?session_id=…&language=es  (body: the recording, as MediaRecorder made it)
// The patient's spoken answer, for them to check before they send it with POST /pain-check.
// The audio isn't stored anywhere.
/** The pain-check chips, in the same order as s.painChips. */
export type PainSymptom = 'sharp' | 'swelling' | 'stiffness' | 'clicking' | 'felt_good'
export interface PainTranscriptResponse {
  /** What they said, as speech-to-text heard it; empty when they said nothing. */
  transcript: string
  /** 1–10; null when no score was heard, so the patient taps one. */
  pain_score: number | null
  symptoms: PainSymptom[]
  /** What they said about how it feels, besides the number, in their language. */
  notes: string
}

// POST /pain-check/speak {text, language} → {audio_url}
// One of the pain check's own lines (its question) in the coach's voice, like PainCheckResponse.audio_url.
export interface CoachLineResponse {
  audio_url: string | null
}

// POST /summary
export interface SummaryRequest {
  patient_id: UUID
}
export interface SummaryResponse {
  summary_text: string
  week_start: ISODateString
  /** true when the text comes from the template, not Gemini (Gemini failed, or mock mode). */
  is_fallback: boolean
}

// GET /patients/{patient_id}/weekly-recap?language=es
// The coach's recap of the patient's own last 7 days, for their home screen.
export interface WeeklyRecapResponse {
  /** Two or three sentences in `language`: sessions vs the plan, the trend vs the target, a next step. */
  text: string
  language: Language
  /** Where `text` streams as speech, like PainCheckResponse.audio_url. null → browser speech. */
  audio_url: string | null
  /** true when Gemini failed or was slow and the template was used. */
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
  /** true only when Gemini drafted latest_summary; false for the template. */
  latest_summary_is_ai: boolean
}

export interface DashboardResponse {
  therapist_id: UUID
  patients: PatientOverview[]
  generated_at: ISODateString
}

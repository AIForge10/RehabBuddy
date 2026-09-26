// In-browser mock backend for VITE_USE_MOCKS=true, plus the template fallbacks
// used by client.ts when a real AI endpoint fails.
//
// Data mirrors the planned seed: 1 therapist, 3 patients, 7–10 days of sessions,
// max angle rising ~72° → 88°, and one high pain score that raises a red flag.
// Persisted in localStorage so the patient tab and dashboard tab share it.
// Each session's angle trace is kept under its own key, so the dashboard's
// poll doesn't re-read every trace.

import type {
  AngleSampleRow,
  Assignment,
  CreateSessionRequest,
  CreateSessionResponse,
  DashboardResponse,
  Patient,
  PainCheckRequest,
  PainCheckResponse,
  PatientOverview,
  RedFlag,
  SessionRecord,
  SummaryResponse,
  UpdateAssignmentRequest,
  UUID,
} from '../types/session'
import { assignmentFor, exerciseFor } from '../lib/exercises'
import { sessionStats } from '../lib/replay'

const STORAGE_KEY = 'rehabbuddy.mock.v6'
const TRACES_KEY = 'rehabbuddy.mock.traces.v1'
/** Traces kept; the oldest drop off so localStorage stays small. */
const KEEP_TRACES = 40
const TRACE_STEP_MS = 100
const THERAPIST_ID = 't-lee'
const DAY_MS = 86_400_000

/** An angle trace as [ms since the session started, angle] pairs, compact for localStorage. */
type Trace = [number, number][]

interface MockDb {
  patients: Patient[]
  assignments: Assignment[]
  sessions: SessionRecord[]
  red_flags: RedFlag[]
}

const kneeBends = {
  id: 'ex-knee-bend',
  name: 'Seated knee bends',
  joint: 'knee',
  instructions:
    'Sit tall at the edge of a chair, side-on to the camera. Slowly bend your knee as far as is comfortable, then straighten it fully.',
}

// Small deterministic PRNG so the seed looks the same on every reload.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

function seed(): MockDb {
  const now = Date.now()
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0)).getTime()
  const patients: Patient[] = [
    { id: 'p-maria', full_name: 'Maria Lopez', language: 'es', injury: 'ACL reconstruction', start_date: new Date(now - 10 * DAY_MS).toISOString() },
    { id: 'p-james', full_name: 'James Carter', language: 'en', injury: 'Grade II MCL sprain', start_date: new Date(now - 8 * DAY_MS).toISOString() },
    { id: 'p-aisha', full_name: 'Aisha Khan', language: 'en', injury: 'Meniscus repair', start_date: new Date(now - 9 * DAY_MS).toISOString() },
  ]
  const assignments: Assignment[] = patients.map((p) => ({
    id: `a-${p.id}`,
    patient_id: p.id,
    therapist_id: THERAPIST_ID,
    exercise: kneeBends,
    target_angle: 90,
    reps: 10,
    times_per_week: 5,
  }))

  // days: how many past days to seed; skip: day offsets with no session.
  const plans: Record<string, { days: number; skip: number[]; from: number; to: number }> = {
    'p-maria': { days: 10, skip: [6, 3], from: 72, to: 86 },
    'p-james': { days: 8, skip: [7, 6, 5, 3, 2], from: 70, to: 79 },
    'p-aisha': { days: 9, skip: [5, 2], from: 74, to: 88 },
  }

  const sessions: SessionRecord[] = []
  const red_flags: RedFlag[] = []
  const rand = rng(42)
  for (const p of patients) {
    const plan = plans[p.id]
    for (let d = plan.days; d >= 1; d--) {
      if (plan.skip.includes(d)) continue
      const progress = (plan.days - d) / (plan.days - 1)
      const started = startOfToday - d * DAY_MS + (17 + Math.floor(rand() * 3)) * 3_600_000
      const max_angle = Math.round(plan.from + (plan.to - plan.from) * progress + (rand() - 0.5) * 3)
      const warnings = rand() < 0.35 ? ['Knee caving inward'] : []
      const pain = 2 + Math.floor(rand() * 3)
      const reps_done = rand() < 0.2 ? 8 : 10
      sessions.push({
        id: `s-${p.id}-${d}`,
        patient_id: p.id,
        started_at: new Date(started).toISOString(),
        reps_done,
        max_angle,
        form_warnings: warnings,
        // 7–9.5 s a rep: the movement and a breather.
        duration_sec: Math.round(reps_done * (7 + rand() * 2.5)),
        pain_score: pain,
        flagged: false,
      })
    }
  }

  // The seeded red flag: James, most recent session, sharp pain.
  const jamesLatest = sessions.filter((s) => s.patient_id === 'p-james').at(-1)!
  jamesLatest.pain_score = 8
  jamesLatest.flagged = true
  red_flags.push({
    session_id: jamesLatest.id,
    patient_id: 'p-james',
    created_at: jamesLatest.started_at,
    pain_score: 8,
    reason: '“Sharp, on the inside of the knee.”',
  })

  return { patients, assignments, sessions, red_flags }
}

/** A stable seed per session id, so a seeded session replays the same way on every reload. */
function hashId(id: string) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * A believable trace for a seeded session, which was never recorded: its reps
 * rise to the session's peak and settle back to rest, spread over its
 * duration, the first a little shallow and the deepest one hitting max_angle.
 * A session that ended in a pain flag falls short in its second half, each
 * rep stalling partway up.
 */
function syntheticTrace(s: SessionRecord, rest: number, floor: number): Trace {
  const rand = rng(hashId(s.id))
  const n = s.reps_done
  const hurt = s.flagged
  const best = hurt ? 1 + Math.floor(rand() * 2) : Math.floor(n * (0.45 + rand() * 0.4))
  const reps = Array.from({ length: n }, (_, i) => {
    const late = hurt && i >= n / 2
    const dip =
      i === best ? 0
      : late ? 8 + rand() * 6
      : i === 0 ? 5 + rand() * 5
      : i === 1 ? 2 + rand() * 4
      : i === n - 1 ? 1.5 + rand() * 3
      : 0.5 + rand() * 3.5
    return {
      peak: s.max_angle - dip,
      up: 1300 + rand() * 900,
      hold: 300 + rand() * 700,
      down: 1200 + rand() * 800,
      stall: late ? 700 + rand() * 900 : 0,
      /** Share of the spare time spent resting after this rep. */
      breather: 0.6 + rand() * 1.4,
    }
  })
  const lead = 1500 + rand() * 1000
  const moving = reps.reduce((sum, r) => sum + r.up + r.hold + r.down + r.stall, 0)
  const spare = Math.max(n * 500, s.duration_sec * 1000 - lead - moving - 1000)
  const breaths = reps.reduce((sum, r) => sum + r.breather, 0)

  // Keyframes; the samples ease between them.
  const keys: Trace = [[0, rest], [lead, rest]]
  let t = lead
  for (const r of reps) {
    if (r.stall) {
      const at = rest + (r.peak - rest) * (0.55 + rand() * 0.15)
      keys.push([(t += r.up * 0.6), at], [(t += r.stall), at + 1], [(t += r.up * 0.4), r.peak])
    } else {
      keys.push([(t += r.up), r.peak])
    }
    keys.push([(t += r.hold), r.peak - 0.5 - rand()], [(t += r.down), rest + rand() * 2], [(t += (spare * r.breather) / breaths), rest + rand() * 1.5])
  }
  keys.push([Math.max(s.duration_sec * 1000, t + 1000), rest])

  const trace: Trace = []
  const end = keys[keys.length - 1][0]
  let k = 0
  for (let at = 0; at <= end; at += TRACE_STEP_MS) {
    while (k < keys.length - 2 && keys[k + 1][0] < at) k++
    const [t0, a0] = keys[k]
    const [t1, a1] = keys[k + 1]
    const u = Math.min(1, Math.max(0, (at - t0) / (t1 - t0)))
    const angle = a0 + ((a1 - a0) * (1 - Math.cos(Math.PI * u))) / 2 + (rand() - 0.5) * 0.8
    trace.push([at, Math.round(Math.min(s.max_angle, Math.max(floor, angle)) * 10) / 10])
  }
  // The deepest sample is exactly the session's recorded peak.
  const top = trace.reduce((best, p, i) => (p[1] > trace[best][1] ? i : best), 0)
  trace[top][1] = s.max_angle
  return trace
}

function readTraces(): Record<UUID, Trace> {
  try {
    return JSON.parse(localStorage.getItem(TRACES_KEY) ?? '{}') as Record<UUID, Trace>
  } catch {
    return {}
  }
}

function writeTraces(added: Record<UUID, Trace>) {
  const kept = Object.entries({ ...readTraces(), ...added }).slice(-KEEP_TRACES)
  try {
    localStorage.setItem(TRACES_KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch {
    /* storage full or unavailable: the replay says there's no trace */
  }
}

/** Every tracked frame → about 10 Hz, timed from the session's start. */
function toTrace(rows: AngleSampleRow[], startedAt: string): Trace {
  const t0 = Date.parse(startedAt)
  const trace: Trace = []
  for (const r of rows) {
    const t = Date.parse(r.time) - t0
    if (t < 0 || (trace.length && t - trace[trace.length - 1][0] < TRACE_STEP_MS * 0.9)) continue
    trace.push([t, Math.round(r.angle * 10) / 10])
  }
  return trace
}

function load(): MockDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as MockDb
  } catch {
    /* fall through to a fresh seed */
  }
  const db = seed()
  save(db)
  writeTraces(
    Object.fromEntries(
      db.sessions.map((s) => {
        const ex = exerciseFor(jointOf(s))
        return [s.id, syntheticTrace(s, ex.rest, Math.min(ex.min, ex.rest))]
      }),
    ),
  )
  return db
}

function save(db: MockDb) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    /* storage unavailable: mock still works for this tab */
  }
}

export function resetMockData() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(TRACES_KEY)
  } catch {
    /* ignore */
  }
}

const delay = <T>(value: T, ms = 150) => new Promise<T>((r) => setTimeout(() => r(value), ms))

// Keyword + score rule shared by the mock and the offline fallback.
const RED_FLAG_WORDS = ['sharp', 'swelling', 'swollen', 'pop', 'numb', 'agudo', 'hinchado', 'hinchazón']

export function fallbackPainCheck(body: PainCheckRequest): PainCheckResponse {
  const notes = body.notes.toLowerCase()
  const word = RED_FLAG_WORDS.find((w) => notes.includes(w))
  const flagged = body.pain_score >= 7 || Boolean(word)
  const es = body.language === 'es'
  if (flagged) {
    return {
      flagged: true,
      reply: es
        ? 'Gracias por decírmelo. He avisado a tu terapeuta. Descansa y no hagas más ejercicios hoy.'
        : "Thanks for telling me. I've let your therapist know. Rest now and skip any more exercises today.",
      flag_reason: body.notes ? `“${body.notes}”` : word ? `Mentioned “${word}”` : 'Pain score at or above 7',
      audio_url: null,
    }
  }
  return {
    flagged: false,
    reply: es
      ? '¡Buen trabajo! Un poco de molestia es normal. Nos vemos en la próxima sesión.'
      : 'Great work! A little soreness is normal. See you next session.',
    flag_reason: null,
    audio_url: null,
  }
}

export function fallbackSummary(): SummaryResponse {
  return {
    summary_text:
      'AI summary is temporarily unavailable. Review the range-of-motion chart and session list below for this week’s progress.',
    week_start: new Date(Date.now() - 7 * DAY_MS).toISOString(),
    is_fallback: true,
  }
}

/** Seeded sessions and ones saved before sessions carried a joint were all knee bends. */
const jointOf = (s: SessionRecord) => s.joint ?? 'knee'

function templateSummary(db: MockDb, patientId: UUID): string {
  const p = db.patients.find((x) => x.id === patientId)
  const plan = db.assignments.find((x) => x.patient_id === patientId)
  const s = db.sessions
    .filter((x) => x.patient_id === patientId && jointOf(x) === plan?.exercise.joint)
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
  if (!p || !plan || s.length === 0) return 'No sessions recorded yet.'
  const ex = exerciseFor(plan.exercise.joint)
  const first = s[0].max_angle
  const last = s[s.length - 1].max_angle
  const week = s.filter((x) => Date.parse(x.started_at) >= new Date().setHours(0, 0, 0, 0) - 6 * DAY_MS).length
  const flags = db.red_flags.filter((f) => f.patient_id === patientId)
  const firstName = p.full_name.split(' ')[0]
  let text = `${firstName} completed ${week} session${week === 1 ? '' : 's'} this week against a plan of ${plan.times_per_week}. ${ex.copy.en.best} improved from ${first}° to ${last}° (target ${plan.target_angle}°).`
  const warn = s.filter((x) => x.form_warnings.length > 0).length
  if (warn) text += ` Form cues were triggered in ${warn} session${warn > 1 ? 's' : ''}, mostly ${ex.formWarning.toLowerCase()}.`
  if (flags.length) text += ` ⚠ Reported pain ${flags.at(-1)!.pain_score}/10 after the latest session — recommend a check-in call before progressing load.`
  else text += ' No concerning pain reports; consider progressing the target.'
  return text
}

/** A trace never changes, so each session's stats are worked out once per target, like the backend's cache. */
const statsCache = new Map<string, SessionRecord['stats']>()

/** Sessions with the stats the backend works out in SQL, from their traces here. */
function withStats(sessions: SessionRecord[], target: number): SessionRecord[] {
  let traces: Record<UUID, Trace> | undefined
  return sessions.map((s) => {
    const key = `${s.id}:${target}`
    if (!statsCache.has(key)) {
      traces ??= readTraces()
      const trace = traces[s.id]
      // Not cached when missing: another tab may still be writing it.
      if (!trace?.length) return { ...s, stats: null }
      statsCache.set(key, sessionStats(trace.map(([t, angle]) => ({ t, angle })), target))
    }
    return { ...s, stats: statsCache.get(key) }
  })
}

function overview(db: MockDb, assignment: Assignment): PatientOverview {
  // "This week" = today plus the 6 days before it, matching the patient home screen.
  const weekAgo = new Date().setHours(0, 0, 0, 0) - 6 * DAY_MS
  const patient = db.patients.find((p) => p.id === assignment.patient_id)!
  const sessions = db.sessions
    .filter((s) => s.patient_id === patient.id && jointOf(s) === assignment.exercise.joint)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
  const recent = sessions.filter((s) => Date.parse(s.started_at) > weekAgo).length
  return {
    patient,
    assignment,
    adherence_7d: recent / assignment.times_per_week,
    sessions: withStats(sessions, assignment.target_angle),
    red_flags: db.red_flags.filter((f) => f.patient_id === patient.id),
    latest_summary: templateSummary(db, patient.id),
    latest_summary_is_ai: false,
  }
}

export const mockBackend = {
  async getAssignment(patientId: UUID): Promise<Assignment> {
    const a = load().assignments.find((x) => x.patient_id === patientId)
    if (!a) throw new Error(`No assignment for patient ${patientId}`)
    return delay(a)
  },

  async createSession(body: CreateSessionRequest): Promise<CreateSessionResponse> {
    const db = load()
    const id = `s-${crypto.randomUUID()}`
    db.sessions.push({
      id,
      patient_id: body.patient_id,
      started_at: body.started_at,
      reps_done: body.reps_done,
      max_angle: body.max_angle,
      form_warnings: body.form_warnings,
      duration_sec: body.duration_sec,
      pain_score: null,
      flagged: false,
      joint: body.joint,
    })
    save(db)
    writeTraces({ [id]: toTrace(body.angle_samples, body.started_at) })
    return delay({ session_id: id })
  },

  async getSessionSamples(sessionId: UUID): Promise<AngleSampleRow[]> {
    const s = load().sessions.find((x) => x.id === sessionId)
    if (!s) throw new Error(`No session ${sessionId}`)
    const t0 = Date.parse(s.started_at)
    const trace = readTraces()[sessionId] ?? []
    return delay(
      trace.map(([t, angle]) => ({ time: new Date(t0 + t).toISOString(), angle })),
      250,
    )
  },

  async painCheck(body: PainCheckRequest): Promise<PainCheckResponse> {
    const db = load()
    const res = fallbackPainCheck(body)
    const s = db.sessions.find((x) => x.id === body.session_id)
    if (s) {
      s.pain_score = body.pain_score
      s.flagged = res.flagged
      if (res.flagged) {
        db.red_flags.push({
          session_id: s.id,
          patient_id: s.patient_id,
          created_at: new Date().toISOString(),
          pain_score: body.pain_score,
          reason: res.flag_reason ?? '',
        })
      }
      save(db)
    }
    return delay(res, 600)
  },

  async getSummary(patientId: UUID): Promise<SummaryResponse> {
    // The mock has no Gemini: its summary is always the template.
    return delay(
      {
        summary_text: templateSummary(load(), patientId),
        week_start: new Date(Date.now() - 7 * DAY_MS).toISOString(),
        is_fallback: true,
      },
      400,
    )
  },

  async getPatientOverview(patientId: UUID): Promise<PatientOverview> {
    const db = load()
    const assignment = db.assignments.find((a) => a.patient_id === patientId)
    if (!assignment) throw new Error(`No assignment for patient ${patientId}`)
    return delay(overview(db, assignment))
  },

  async getDashboard(therapistId: UUID): Promise<DashboardResponse> {
    const db = load()
    const patients = db.assignments.filter((a) => a.therapist_id === therapistId).map((a) => overview(db, a))
    return delay({ therapist_id: therapistId, patients, generated_at: new Date().toISOString() }, 100)
  },

  async updateAssignment(assignmentId: UUID, body: UpdateAssignmentRequest): Promise<Assignment> {
    const db = load()
    const i = db.assignments.findIndex((a) => a.id === assignmentId)
    if (i < 0) throw new Error(`No assignment ${assignmentId}`)
    const updated: Assignment = {
      ...assignmentFor(db.assignments[i], exerciseFor(body.joint)),
      target_angle: body.target_angle,
      reps: body.reps,
      times_per_week: body.times_per_week,
    }
    db.assignments[i] = updated
    save(db)
    return delay(updated, 400)
  },
}

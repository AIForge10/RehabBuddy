-- RehabBuddy schema (Tiger Data = PostgreSQL + TimescaleDB)
-- IDs are TEXT so they match the frontend's ids ('p-maria', 't-lee', 's-...').
-- Run in Tiger console SQL editor, or: psql "$DATABASE_URL" -f schema.sql
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Every user (patient or therapist). Login = email + password.
-- password_hash format: pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>  (never store plain passwords)
CREATE TABLE IF NOT EXISTS profiles (
  id            TEXT PRIMARY KEY,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('patient', 'therapist')),
  language      TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'es')),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS therapist_patients (
  therapist_id TEXT REFERENCES profiles(id),
  patient_id   TEXT REFERENCES profiles(id),
  injury       TEXT,
  start_date   DATE,
  PRIMARY KEY (therapist_id, patient_id)
);

-- Exercise library: any joint (knee, hip, elbow, shoulder, wrist)
CREATE TABLE IF NOT EXISTS exercises (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  joint        TEXT NOT NULL CHECK (joint IN ('knee', 'hip', 'elbow', 'shoulder', 'wrist')),
  instructions TEXT
);

CREATE TABLE IF NOT EXISTS assignments (
  id             TEXT PRIMARY KEY,
  patient_id     TEXT REFERENCES profiles(id),
  therapist_id   TEXT REFERENCES profiles(id),
  exercise_id    TEXT REFERENCES exercises(id),
  target_angle   NUMERIC NOT NULL,
  reps           INT NOT NULL,
  times_per_week INT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  assignment_id TEXT REFERENCES assignments(id),
  patient_id    TEXT REFERENCES profiles(id),
  joint         TEXT NOT NULL DEFAULT 'knee',
  started_at    TIMESTAMPTZ NOT NULL,
  reps_done     INT NOT NULL,
  max_angle     NUMERIC NOT NULL,       -- degrees; knee: flexion (straight = 0)
  form_warnings TEXT[] NOT NULL DEFAULT '{}',   -- codes: not_deep_enough, too_fast
  duration_sec  INT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_patient_time ON sessions (patient_id, started_at DESC);

-- ★ Tiger Data prize table: every angle frame from every session
CREATE TABLE IF NOT EXISTS angle_samples (
  time       TIMESTAMPTZ NOT NULL,
  session_id TEXT NOT NULL,
  angle      NUMERIC NOT NULL
);
SELECT create_hypertable('angle_samples', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS angle_samples_session ON angle_samples (session_id, time DESC);

CREATE TABLE IF NOT EXISTS pain_checkins (
  id         TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  pain_score INT CHECK (pain_score BETWEEN 0 AND 10),
  notes      TEXT DEFAULT '',
  flagged    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_summaries (
  id           TEXT PRIMARY KEY,
  patient_id   TEXT REFERENCES profiles(id),
  week_start   DATE,
  summary_text TEXT,
  source       TEXT NOT NULL DEFAULT 'template' CHECK (source IN ('gemini', 'template')),  -- who wrote it
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Databases made before source and created_at existed get them here (safe to re-run).
ALTER TABLE ai_summaries ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'template'
  CHECK (source IN ('gemini', 'template'));
ALTER TABLE ai_summaries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ★ Continuous aggregate: per-session peak + average angle per minute
CREATE MATERIALIZED VIEW IF NOT EXISTS session_angle_1m
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 minute', time) AS bucket, session_id,
       max(angle) AS max_angle, avg(angle) AS avg_angle, count(*) AS samples
FROM angle_samples
GROUP BY bucket, session_id
WITH NO DATA;

-- ★ Access rule, in ONE place: may viewer_id see patient_id's data?
--   patient   -> only their own data
--   therapist -> only patients assigned to them in therapist_patients
CREATE OR REPLACE FUNCTION can_view_patient(viewer_id TEXT, patient_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles v
    WHERE v.id = viewer_id
      AND (
        (v.role = 'patient'   AND v.id = patient_id)
        OR
        (v.role = 'therapist' AND EXISTS (
            SELECT 1 FROM therapist_patients tp
            WHERE tp.therapist_id = v.id AND tp.patient_id = can_view_patient.patient_id))
      )
  )
$$;

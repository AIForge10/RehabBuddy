CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

DROP TABLE IF EXISTS ai_summaries CASCADE;
DROP TABLE IF EXISTS pain_checkins CASCADE;
DROP TABLE IF EXISTS angle_samples CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS assignments CASCADE;
DROP TABLE IF EXISTS exercises CASCADE;
DROP TABLE IF EXISTS therapist_patients CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

CREATE TYPE user_role AS ENUM('patient', 'therapist');


CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'en', -- 'en' or 'es'
    
    email VARCHAR(255) UNIQUE,
    hashed_password TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    token_version INT NOT NULL DEFAULT 1, 

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE therapist_patients (
    therapist_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    injury VARCHAR(255) NOT NULL, -- e.g. 'ACL reconstruction', 'MCL sprain'
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    PRIMARY KEY (therapist_id, patient_id)
);

CREATE TABLE exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL, -- e.g. 'Knee Flexion'
    joint VARCHAR(50) NOT NULL DEFAULT 'knee',
    instructions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    therapist_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
    target_angle NUMERIC(5, 2) NOT NULL, -- e.g. 90.00
    reps INT NOT NULL, -- e.g. 10
    times_per_week INT NOT NULL, -- e.g. 3
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL,
    patient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reps_done INT NOT NULL DEFAULT 0,
    max_angle NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    form_warnings JSONB DEFAULT '[]'::jsonb -- stores warning events as array
);

CREATE TABLE angle_samples (
    time TIMESTAMPTZ NOT NULL,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    angle NUMERIC(5, 2) NOT NULL
);

-- turn angle_samples into a TimescaleDB Hypertable
SELECT create_hypertable(
    'angle_samples',
    'time',
    if_not_exists => TRUE,
    migrate_data => TRUE
);

-- index for time-series range lookups per session
CREATE INDEX IF NOT EXISTS idx_angle_samples_session_time 
    ON angle_samples (session_id, time DESC);

CREATE TABLE pain_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    pain_score INT NOT NULL CHECK (pain_score BETWEEN 1 AND 10),
    notes TEXT,
    flagged BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,
    summary_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- pre-buckets real-time angles down to 1-second intervals for frontend
CREATE MATERIALIZED VIEW IF NOT EXISTS angle_samples_1s
WITH (timescaledb.continuous) AS
SELECT 
    session_id,
    time_bucket('1 second', time) AS bucket,
    AVG(angle) AS avg_angle,
    MAX(angle) AS max_angle,
    MIN(angle) AS min_angle
FROM angle_samples
GROUP BY session_id, bucket
WITH NO DATA;

-- auto-refresh policy for continuous aggregate every 10 seconds
SELECT add_continuous_aggregate_policy('angle_samples_1s',
    start_offset => INTERVAL '1 hour',
    end_offset => INTERVAL '1 second',
    schedule_interval => INTERVAL '10 seconds',
    if_not_exists => TRUE
);
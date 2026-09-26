-- Queries behind each GET endpoint. :pid / :tid are parameters.

-- GET /patients/{pid}/assignment
SELECT a.id, a.patient_id, a.therapist_id, a.target_angle, a.reps, a.times_per_week,
       json_build_object('id', e.id, 'name', e.name, 'joint', e.joint, 'instructions', e.instructions) AS exercise
FROM assignments a JOIN exercises e ON e.id = a.exercise_id
WHERE a.patient_id = :'pid';

-- GET /patients/{pid}/overview  → sessions (newest first) with pain + flag
SELECT s.id, s.patient_id, s.started_at, s.reps_done, s.max_angle, s.form_warnings, s.duration_sec,
       pc.pain_score, COALESCE(pc.flagged, false) AS flagged
FROM sessions s LEFT JOIN pain_checkins pc ON pc.session_id = s.id
WHERE s.patient_id = :'pid'
ORDER BY s.started_at DESC;

-- adherence_7d = sessions in last 7 days / times_per_week
SELECT round(count(s.id)::numeric / a.times_per_week, 2) AS adherence_7d
FROM assignments a
LEFT JOIN sessions s ON s.patient_id = a.patient_id
                    AND s.started_at >= date_trunc('day', now()) - interval '6 days'
WHERE a.patient_id = :'pid'
GROUP BY a.times_per_week;

-- red_flags for a patient
SELECT pc.session_id, s.patient_id, pc.created_at, pc.pain_score, pc.notes AS reason
FROM pain_checkins pc JOIN sessions s ON s.id = pc.session_id
WHERE s.patient_id = :'pid' AND pc.flagged
ORDER BY pc.created_at DESC;

-- latest_summary
SELECT summary_text FROM ai_summaries WHERE patient_id = :'pid' ORDER BY week_start DESC LIMIT 1;

-- GET /therapist/{tid}/dashboard → run the overview queries for each of these patients
SELECT patient_id FROM therapist_patients WHERE therapist_id = :'tid';

-- ★ Tiger Data: range-of-motion trend per day (for the chart) from the hypertable
SELECT time_bucket('1 day', a.time) AS day, max(a.angle) AS peak_angle
FROM angle_samples a JOIN sessions s ON s.id = a.session_id
WHERE s.patient_id = :'pid'
GROUP BY day ORDER BY day;

-- ★ Tiger Data: one session's angle curve, from the continuous aggregate
SELECT bucket, max_angle, avg_angle FROM session_angle_1m
WHERE session_id = :'sid' ORDER BY bucket;

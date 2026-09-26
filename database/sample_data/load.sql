-- Load the CSVs (run from the sample_data folder):
--   psql "$DATABASE_URL" -f load.sql
-- Re-runnable: clears the demo data first.
TRUNCATE ai_summaries, pain_checkins, angle_samples, sessions, assignments,
         exercises, therapist_patients, profiles CASCADE;

\copy profiles           FROM 'tables/profiles.csv'           CSV HEADER
\copy therapist_patients FROM 'tables/therapist_patients.csv' CSV HEADER
\copy exercises          FROM 'tables/exercises.csv'          CSV HEADER
\copy assignments        FROM 'tables/assignments.csv'        CSV HEADER
\copy sessions           FROM 'tables/sessions.csv'           CSV HEADER
\copy angle_samples      FROM 'tables/angle_samples.csv'      CSV HEADER
\copy pain_checkins      FROM 'tables/pain_checkins.csv'      CSV HEADER
\copy ai_summaries       FROM 'tables/ai_summaries.csv'       CSV HEADER

CALL refresh_continuous_aggregate('session_angle_1m', NULL, NULL);

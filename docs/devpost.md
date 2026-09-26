# Devpost submission: bendwith.us

Paste each section into the matching Devpost field. Keep the sponsor paragraphs: the MLH judges read
them to decide the sponsor prizes.

## Tagline

Home rehab that bends with you. Any webcam becomes the measuring tape, the voice coach, and the
therapist's eyes between visits.

## Inspiration

After a knee surgery, about 90% of rehab happens alone at home with a paper handout. Nobody measures
the joint, so the patient doesn't know if today's bend was better than yesterday's, and the therapist
adjusts the plan at the next visit from memory. We wanted the movement itself to be the interface: no
typing, no chat window, just do the exercise and let the numbers reach the person who prescribed it.

## What it does

The patient picks up their phone or laptop, sits side-on to the camera, and does their prescribed
exercise (knee, hip, shoulder, elbow or wrist). bendwith.us measures the joint angle to the degree on
every frame, counts reps out loud, tells them to hold at the target, calls out form faults, and stops
the session if they say it hurts. A spoken pain check-in follows: they say the score, the coach answers
in their language. The therapist sees every patient's range-of-motion trend, replays any session rep by
rep, watches a session live, gets a weekly summary, and approves a plan change drafted by AI and checked
by clinical rules. Nothing reaches the patient until the therapist approves it.

## How we built it

- **Pose tracking in the browser** with MediaPipe Pose. Video never leaves the device; only joint
  angles, reps and pain scores go to the server. The same React build ships as an iOS and Android app
  with Capacitor, with the model bundled inside.
- **Gemini API** drafts the therapist's next plan step with structured output (progress, hold or
  regress, with a rationale citing the patient's own numbers), writes the weekly summary and recap,
  answers the pain check-in, and extracts the score and symptoms from a spoken answer. A rules layer
  overrides any suggestion that would progress a patient after a red flag. Every call has a template
  fallback, so the app never shows an error during a session.
- **ElevenLabs** gives the coach one voice in English and Spanish: 122 cue lines pre-generated with
  `eleven_multilingual_v2`, live replies streamed with `eleven_flash_v2_5` so audio starts before
  synthesis finishes, and Scribe speech-to-text for the spoken pain check-in. The audio is transcribed
  once and never stored.
- **Tiger Data** (PostgreSQL + TimescaleDB) holds every angle frame of every session in a hypertable.
  A real-time continuous aggregate rolls sessions up per minute for the plan suggestion, `time_bucket`
  serves the 10 Hz replay and the daily trend chart, columnstore compression shrinks finished sessions
  about 7 to 1, and the who-can-see-whom rule is one SQL function the backend calls on every request.
  The clinic dashboard's Data card shows those numbers live from the database's own catalog.
- **DigitalOcean App Platform** runs the FastAPI backend and serves the web app, from the app spec in
  the repo, on **bendwith.us**, a `.us` domain from GoDaddy Registry.
- FastAPI backend with JWT auth, WebSocket in and Server-Sent Events out for live sessions.

## Challenges we ran into

Measuring a joint angle from a 2D camera is only accurate side-on, so the setup screen checks placement,
framing and light itself before a session starts. Voice latency mattered more than we expected: a coach
that answers a second late feels wrong, so fixed lines are pre-generated and live lines stream. And an
AI that proposes clinical changes needs guardrails, so the rules layer can veto Gemini and says why.

## Accomplishments that we're proud of

A real task end to end with no chat window. The same code on the web and on phones. A plan-change
loop where AI drafts, rules check, and a human decides. Angle data that a therapist can act on: rep
by rep peaks, fade across a session, seconds held at end range.

## What we learned

How much of physical therapy is adherence and measurement rather than technique, and how far a webcam
gets you when the exercise is chosen to suit the camera.

## What's next

More exercises per joint, standing exercises with a second camera angle, and a therapist's weekly
digest by email. We'd like to run it with a clinic.

## Built with

react, typescript, vite, tailwind, mediapipe, capacitor, fastapi, python, gemini-api, elevenlabs,
tiger-data, timescaledb, postgresql, digitalocean, godaddy-registry

## Tracks

Microsoft "What's Missing?", Best Use of ElevenLabs, Best Use of Gemini API, Best Use of Tiger Data,
Best Use of DigitalOcean, Best Domain Name from GoDaddy Registry, Assurant "Take Control of AI".

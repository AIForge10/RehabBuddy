# Devpost submission: Bend With Us (bendwith.us)

What we submitted to ShellHacks 2026 on Devpost, field by field. Keep it in sync with the Devpost page.

## Project name

Bend With Us

## Elevator pitch (200 characters max)

Your phone becomes a therapist's goniometer: it measures each bend to the degree, coaches you by voice in English and Spanish, and sends your therapist real numbers. Video never leaves your device.

## About the project

```markdown
[![Banner](https://raw.githubusercontent.com/AIForge10/RehabBuddy/main/docs/banner.jpg)](https://bendwith.us/)

## Inspiration

Most of knee, hip or shoulder rehab happens at home, alone, with a paper handout. Nobody measures the joint between visits. The patient can't tell if today's bend was better than yesterday's, and the therapist changes the plan at the next appointment based on memory and "how does it feel?"

A goniometer (the plastic protractor physical therapists use) costs a few dollars, but it needs a second person to read it. Almost everyone already has a camera that can see the joint. We wanted the exercise itself to be the interface: no typing and no chat window. You do the movement, and the numbers go to the person who prescribed it.

## What it does

**Bend With Us** is an AI physical therapy coach for the knee, hip, shoulder, elbow and wrist.

**For the patient:** sit side-on to your phone or laptop camera. The setup screen checks placement, framing and light on its own, then starts the exercise. The app measures your joint angle on every frame, counts reps out loud, tells you to hold at your target, and calls out form faults ("too fast", "not deep enough"). Say "it hurts" and it stops. A spoken pain check follows: you say your score, and the coach answers in English or Spanish. Each week a recap of your progress is read aloud to you.

**For the therapist:** a caseload dashboard showing adherence, best angle, latest pain and red flags. There's a range-of-motion chart for every joint, a rep-by-rep replay of any session, and a live view of a session in progress (angles only, never video). Gemini drafts a plan change (progress, hold or regress) that cites the patient's own numbers, clinical rules check it, and **nothing reaches the patient until the therapist approves it.**

Video never leaves the device. Only angles, reps and pain scores do.

## How we built it

**Pose tracking in the browser.** MediaPipe Pose runs on the device and gives us body landmarks every frame.

**The stack:**
- **Frontend:** React 19, TypeScript, Vite and Tailwind. The same build ships to iPhone and Android with Capacitor, with the pose model bundled in the app.
- **Backend:** FastAPI with JWT auth and Sign in with Google (Google Identity Services, with the ID token verified on the server). Live sessions come in over WebSocket and go out to the therapist over Server-Sent Events.
- **Gemini API:** the plan suggestion (structured output), weekly summary and recap, pain-check replies, and pulling the score and symptoms out of a spoken answer.
- **ElevenLabs:** one coach voice in two languages. 130 cue clips are pre-generated with `eleven_multilingual_v2`, live replies stream with `eleven_flash_v2_5` so audio starts before synthesis finishes, and Scribe handles speech-to-text for the pain check.
- **Tiger Data (TimescaleDB):** every angle frame of every session goes into a hypertable. A real-time continuous aggregate rolls sessions up per minute for the plan suggestion, `time_bucket` serves the replay and the daily trend, and columnstore compression shrinks finished sessions about 11:1 on our data. The rule for which therapist sees which patient is a single SQL function.
- **DigitalOcean App Platform** hosts the API and the web app on **bendwith.us**, a `.us` domain (the .us registry is run by GoDaddy Registry).

## Challenges we ran into

**2D only works side-on.** A camera measures the angle projected onto its image plane, so a joint turned towards the lens reads short. Instead of hoping patients set up correctly, the app checks placement, framing and light itself, and starts only when all three pass.

**Seated hip reps never ended.** The seated hip rests at about 86 degrees, not 0 degrees, and patients who leaned forward to lift then sat that way, stuck mid-rep. The counter now learns each patient's rest angle, moves the rep thresholds with it, and ends a rep wherever the leg settles.

**Voice latency.** A coach that answers a second late feels broken. Fixed cues are pre-generated clips, and only the replies that must be live are streamed.

## Accomplishments that we're proud of

- A real clinical task done end to end with no chat window: you move, it measures, your therapist sees it.
- Data a therapist can act on: peaks rep by rep, fade across a session, and seconds held at end range. Not just "completed".
- A plan-change loop where AI drafts, rules check, and a human decides.
- One codebase on the web, iPhone and Android, with video that never leaves the device.
- A built-in accuracy harness (`/pose-debug`) that records held poses against a goniometer and reports mean absolute error and Bland–Altman limits of agreement.
- **You stay in control of the AI:** video never leaves your device (only angles, reps and pain scores are shared), Gemini only drafts plan changes that your therapist must approve, and saying "it hurts" stops any session.

## What we learned

- Much of physical therapy is adherence and measurement, not technique. A patient who can see their number go up keeps going.
- Choose the exercise to suit the camera. Seated, side-on movements give a webcam a fair chance at clinical-grade readings.
- Coordinate systems matter. Our biggest accuracy bug wasn't the model; it was the aspect ratio.
- With AI in a health workflow, the fallbacks and guardrails are the product, not an extra.
- Voice changes everything about pacing. Timing matters as much as the words.

## What's next for Bend With Us

- Publish our measured error against a goniometer across more people and every joint.
- More exercises per joint, and standing exercises with a second camera angle.
- Natively designed iOS and Android apps for an even better mobile experience.
- A weekly email digest for therapists.
- A pilot with a real clinic and its patients.
```

## Built with

gemini, elevenlabs, tigerdata, digitalocean, godaddy-registry, react, vite, tailwind, fastapi,
mediapipe, typescript, python, capacitor, timescaledb, postgresql, google-identity, github-actions

## Sponsor / special prizes

Microsoft, [MLH] Best Use of ElevenLabs, [MLH] Best Use of Gemini API, [MLH] Best Use of Tiger Data,
[MLH] Best Use of DigitalOcean, [MLH] Best Domain Name from GoDaddy Registry, Assurant "Take Control of AI".

## Links

- Try it out: https://bendwith.us
- Code: https://github.com/AIForge10/RehabBuddy

## Image gallery captions (140 characters max)

| Image | Caption |
| --- | --- |
| Welcome | Home rehab that bends with you: any webcam or phone camera measures your joint angle to the degree. Video never leaves your device. |
| Patient home | Maria's home screen: today's exercise, her week at a glance, and a weekly recap from her voice coach in English or Spanish. |
| Exercise demo | Watch one rep, then do it. Knee, hip, shoulder, elbow and wrist. Only the angle, reps and pain score are sent, never the video. |
| Pain check | Spoken pain check: say your score and the coach replies. Say "it hurts" and the session stops. You stay in control, not the AI. |
| Patient data | Real numbers for the therapist: session peaks and the range-of-motion trend. Gemini only drafts plan changes the therapist approves. |
| Therapist caseload | Dr. Lee's caseload: adherence, best angle, latest pain and red flags at a glance, plus a suggested next step for each patient. |
| Therapist, continued | Weekly summary written by Gemini from the patient's own numbers, plus every session's range-of-motion curve, rep by rep. |
| Session deep dive | Replay any session rep by rep: peak angle per rep, fade across the set and seconds held at end range. Angles only, never video. |
| Plan editor | The therapist stays in charge: Gemini drafts a plan change, clinical rules check it, and nothing reaches the patient until approved. |
| Tiger Data | Tiger Data (TimescaleDB): every angle frame in a hypertable, rolled up by a continuous aggregate and compressed about 11:1. |

## Video

1 to 2 minutes (ShellHacks rule). The privacy line to say if re-recording: "The camera video never leaves
your phone. We only send the angle, reps and pain score, and the AI can't change your plan until your
therapist approves it."

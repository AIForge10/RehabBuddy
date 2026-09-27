# Email OTP verification (optional, off by default)

With `OTP_REQUIRED=true`, new accounts confirm their email with a 6-digit code before they can sign in.
Existing accounts (the demo users) are treated as verified. It is **off on the live site**, which has no
email provider; there, sign-up logs in at once. Sign in with Google never needs a code (Google has
already verified the email).

## Flow
1. Create account → `POST /api/v1/auth/signup` → **202** `{status: "verification_required", email}`; a code is emailed. No token yet.
2. The OTP field appears → `POST /api/v1/auth/verify-otp {email, code}` → **200**, same body as login (token + user).
3. "Resend code" → `POST /api/v1/auth/resend-otp {email}` (max once per 60 s).
4. Logging in before verifying → `POST /auth/login` returns **403 `email_not_verified`** and emails a code → show the OTP field.

## Security
Random 6-digit codes · stored only as an HMAC hash · expire after 10 min · 5 wrong attempts max ·
60 s resend cooldown · one-time use · resend gives the same answer for unknown emails.

## On/off switch
The code step only runs with `OTP_REQUIRED=true`. Unset (the default, and the live site today),
sign-up logs in at once exactly as before, `/auth/verify-otp` and `/auth/resend-otp` answer 404, and the
backend never touches `email_verified` or `email_otps`. Turn it on only where an email provider is configured.

## Setup (local)
1. **Test database only.** Create a second Tiger service (or local Postgres), load it with
   `python database/sample_data/load_to_tiger.py`, and point your LOCAL `.env` `DATABASE_URL` at it.
2. Run the migration on that test DB: `psql "$DATABASE_URL" -f database/migrations/001_email_otp.sql`
   (or paste it into the Tiger SQL editor of the TEST service).
3. Turn it on: `OTP_REQUIRED=true` in `.env`.
4. Email sending, pick one in `.env`:
   - Dev: `OTP_DEV_MODE=true` → the code is printed in the uvicorn terminal (no email sent).
   - Resend: `RESEND_API_KEY=...` and `EMAIL_FROM="RehabBuddy <no-reply@bendwith.us>"` (verify the domain in Resend first).
   - SMTP (e.g. Gmail app password): `SMTP_HOST=smtp.gmail.com SMTP_PORT=587 SMTP_USER=... SMTP_PASSWORD=... EMAIL_FROM=...`
5. Tests: `cd backend && RUN_DB_TESTS=1 python -m pytest tests/test_otp_flow.py -q` (writes to
   `DATABASE_URL`, so only against the test database).

## Turning it on for the live site (after the hackathon)
- Run the migration on the live DB (safe: existing users become `email_verified = TRUE`).
- Add an email provider to the DigitalOcean backend (Resend with a verified domain, or SMTP).
- Then set `OTP_REQUIRED=true` there. The frontend already handles both modes (`OtpStep.tsx`).

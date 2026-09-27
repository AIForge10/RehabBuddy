# Email OTP verification (branch: satyabrata/email-otp)

New accounts must confirm their email with a 6-digit code before they can sign in.
Existing accounts (the demo users) are treated as verified.

## Flow
1. Create account → `POST /api/v1/auth/signup` → **202** `{status: "verification_required", email}`; a code is emailed. No token yet.
2. The OTP field appears → `POST /api/v1/auth/verify-otp {email, code}` → **200**, same body as login (token + user).
3. "Resend code" → `POST /api/v1/auth/resend-otp {email}` (max once per 60 s).
4. Logging in before verifying → `POST /auth/login` returns **403 `email_not_verified`** and emails a code → show the OTP field.

## Security
Random 6-digit codes · stored only as an HMAC hash · expire after 10 min · 5 wrong attempts max ·
60 s resend cooldown · one-time use · resend gives the same answer for unknown emails.

## Setup (local)
1. **Test database only.** Create a second Tiger service (or local Postgres), load it with
   `python database/sample_data/load_to_tiger.py`, and point your LOCAL `.env` `DATABASE_URL` at it.
2. Run the migration on that test DB: `psql "$DATABASE_URL" -f database/migrations/001_email_otp.sql`
   (or paste it into the Tiger SQL editor of the TEST service).
3. Email sending, pick one in `.env`:
   - Dev: `OTP_DEV_MODE=true` → the code is printed in the uvicorn terminal (no email sent).
   - Resend: `RESEND_API_KEY=...` and `EMAIL_FROM="RehabBuddy <no-reply@bendwith.us>"` (verify the domain in Resend first).
   - SMTP (e.g. Gmail app password): `SMTP_HOST=smtp.gmail.com SMTP_PORT=587 SMTP_USER=... SMTP_PASSWORD=... EMAIL_FROM=...`
4. Tests: `cd backend && python -m pytest tests/test_otp_flow.py -q`

## Before merging to main (after the hackathon)
- Run the migration on the live DB (safe: existing users become `email_verified = TRUE`).
- Add the email provider variables to the DigitalOcean backend.
- Update the frontend sign-up and login screens (see `frontend/src/components/OtpStep.tsx`).

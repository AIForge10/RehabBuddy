-- Email OTP verification. Safe to run more than once.
-- Run on a TEST database first (NOT the live demo DB before judging).

-- Existing accounts (demo users) count as verified; new sign-ups start unverified.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;

-- One active code per email. Only a hash of the code is stored, never the code itself.
CREATE TABLE IF NOT EXISTS email_otps (
  email         TEXT PRIMARY KEY,
  code_hash     TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  attempts      INT NOT NULL DEFAULT 0,
  last_sent_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

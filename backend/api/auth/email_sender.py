"""Sends the verification email. Picks the first configured option:

1. Resend (https://resend.com)      RESEND_API_KEY, EMAIL_FROM
2. Any SMTP server (e.g. Gmail)      SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM
3. Dev mode (no email is sent)       OTP_DEV_MODE=true  -> the code is printed in the server log

If none is configured, sending fails loudly instead of silently dropping the code.
"""
import logging
import os
import smtplib
from email.message import EmailMessage

import httpx

log = logging.getLogger("rehabbuddy.email")


class EmailNotConfigured(RuntimeError):
    pass


def _content(code: str) -> tuple[str, str, str]:
    subject = f"Your RehabBuddy code: {code}"
    text = (f"Your RehabBuddy verification code is {code}.\n\n"
            "It expires in 10 minutes. If you didn't try to create an account, ignore this email.")
    html = (f"<p>Your RehabBuddy verification code is</p>"
            f"<p style='font-size:28px;font-weight:bold;letter-spacing:6px'>{code}</p>"
            f"<p>It expires in 10 minutes. If you didn't try to create an account, ignore this email.</p>")
    return subject, text, html


def send_otp_email(to: str, code: str) -> None:
    subject, text, html = _content(code)
    sender = os.getenv("EMAIL_FROM", "RehabBuddy <onboarding@resend.dev>")

    if os.getenv("RESEND_API_KEY"):
        r = httpx.post("https://api.resend.com/emails", timeout=10,
                       headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"},
                       json={"from": sender, "to": [to], "subject": subject, "text": text, "html": html})
        if r.status_code >= 300:
            raise RuntimeError(f"Resend error {r.status_code}: {r.text[:200]}")
        return

    if os.getenv("SMTP_HOST"):
        msg = EmailMessage()
        msg["Subject"], msg["From"], msg["To"] = subject, sender, to
        msg.set_content(text)
        msg.add_alternative(html, subtype="html")
        with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.getenv("SMTP_PORT", "587")), timeout=10) as s:
            s.starttls()
            s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
            s.send_message(msg)
        return

    if os.getenv("OTP_DEV_MODE", "").lower() == "true":
        log.warning("OTP_DEV_MODE: verification code for %s is %s", to, code)
        print(f"[OTP_DEV_MODE] verification code for {to}: {code}", flush=True)
        return

    raise EmailNotConfigured("No email provider configured (RESEND_API_KEY, SMTP_HOST or OTP_DEV_MODE)")

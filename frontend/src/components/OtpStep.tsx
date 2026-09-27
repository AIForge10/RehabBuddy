// The "enter the 6-digit code" step. Drop it into the create-account (and login) screen:
//   {pendingEmail && <OtpStep email={pendingEmail} onVerified={(u) => window.location.assign(homePathFor(u.role))} />}
import { useEffect, useState } from 'react'
import { resendOtp, verifyOtp, type AuthUser } from '../api/auth'

interface Props {
  email: string
  onVerified: (user: AuthUser) => void
}

export default function OtpStep({ email, onVerified }: Props) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(60)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function submit(value = code) {
    if (value.length !== 6) return
    setBusy(true); setError(null); setInfo(null)
    try {
      onVerified(await verifyOtp(email, value))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    setError(null); setInfo(null)
    try {
      await resendOtp(email)
      setInfo('A new code is on its way')
      setCooldown(60)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't resend")
    }
  }

  return (
    <div className="space-y-3">
      <p>
        We sent a 6-digit code to <strong>{email}</strong>. It expires in 10 minutes.
      </p>
      <input
        value={code}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 6)
          setCode(v)
          if (v.length === 6) void submit(v)   // auto-submit when complete
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        aria-label="Verification code"
        maxLength={6}
        autoFocus
        className="w-40 rounded-xl border px-4 py-3 text-center text-2xl tracking-[0.4em]"
      />
      {error && <p className="text-red-500">{error}</p>}
      {info && <p className="text-green-600">{info}</p>}
      <div className="flex items-center gap-4">
        <button onClick={() => void submit()} disabled={busy || code.length !== 6}>
          {busy ? 'Checking…' : 'Verify'}
        </button>
        <button onClick={() => void resend()} disabled={cooldown > 0}>
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
      </div>
    </div>
  )
}

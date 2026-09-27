import { useEffect, useState } from 'react'
import { resendOtp, verifyOtp, type AuthUser } from '../api/auth'
import { Button } from './Screen'
import { FormError, Spinner } from '../screens/auth/AuthLayout'

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
    <div className="flex flex-col items-center gap-5">
      <input
        value={code}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 6)
          setCode(v)
          if (v.length === 6) void submit(v)
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        aria-label="Verification code"
        maxLength={6}
        autoFocus
        className="w-56 rounded-2xl bg-surface px-4 py-3.5 text-center text-3xl font-mono tracking-[0.35em] text-ink ring-1 ring-line-strong focus:outline-none focus:ring-2 focus:ring-brand-ink"
      />
      {error && <FormError>{error}</FormError>}
      {info && <p className="text-sm font-medium text-emerald-400">{info}</p>}

      <div className="flex w-full flex-col gap-3">
        <Button onClick={() => void submit()} disabled={busy || code.length !== 6} className="w-full">
          {busy ? <><Spinner /> Checking…</> : 'Verify & Continue'}
        </Button>
        <button
          type="button"
          onClick={() => void resend()}
          disabled={cooldown > 0}
          className="text-center text-sm font-semibold text-brand-ink underline-offset-4 hover:underline disabled:opacity-50 disabled:no-underline"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
      </div>
    </div>
  )
}


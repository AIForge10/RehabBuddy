import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthError, googleEnabled } from '../../api/auth'
import GoogleButton from '../../components/GoogleButton'
import { ArrowRight, Button } from '../../components/Screen'
import { useAuth } from '../../lib/auth'
import type { Strings } from '../../lib/i18n'
import { useLanguage } from '../../lib/language'
import type { Role } from '../../types/session'
import { AuthLayout, EMAIL_RE, Field, FormError, PasswordField, Spinner } from './AuthLayout'

// Errors are kept as string keys, not text, so flipping EN/ES re-translates them.
type ErrKey = keyof Pick<Strings, 'errEmail' | 'errPasswordEmpty' | 'errInvalid' | 'errGeneric' | 'errGoogle'>
const ROLES: Role[] = ['patient', 'therapist']

export default function Login() {
  const { s } = useLanguage()
  const { signIn, demoSignIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: ErrKey; password?: ErrKey; form?: ErrKey }>({})
  const [pending, setPending] = useState<'form' | 'google' | Role | null>(null)

  // Success needs no navigation here: the signed-in account makes the route redirect.
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (!EMAIL_RE.test(email.trim())) next.email = 'errEmail'
    if (!password) next.password = 'errPasswordEmpty'
    setErrors(next)
    if (next.email || next.password) return
    setPending('form')
    try {
      await signIn(email, password)
    } catch (err) {
      setErrors({ form: err instanceof AuthError ? 'errInvalid' : 'errGeneric' })
      setPending(null)
    }
  }

  const demo = (role: Role) => {
    setPending(role)
    demoSignIn(role).catch(() => {
      setErrors({ form: 'errGeneric' })
      setPending(null)
    })
  }

  return (
    <AuthLayout
      title={s.loginTitle}
      sub={s.loginSub}
      footer={
        <>
          {s.noAccount}{' '}
          <Link to="/signup" className="font-bold text-brand-ink underline-offset-4 hover:underline">
            {s.createAccount}
          </Link>
        </>
      }
    >
      {googleEnabled && (
        <>
          <GoogleButton
            role="patient"
            onError={() => setErrors({ form: 'errGoogle' })}
            onPending={(on) => setPending(on ? 'google' : null)}
          />
          <div className="label-mono my-6 flex items-center gap-4 text-muted">
            <span className="h-px flex-1 bg-line" />
            {s.orEmail}
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form noValidate onSubmit={submit} className="flex flex-col gap-5">
        {errors.form && <FormError>{s[errors.form]}</FormError>}
        <Field
          label={s.email}
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email && s[errors.email]}
        />
        <PasswordField
          label={s.password}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password && s[errors.password]}
        />
        <Button type="submit" disabled={pending != null} className="mt-1 w-full">
          {pending === 'form' ? (
            <>
              <Spinner />
              {s.loggingIn}
            </>
          ) : (
            s.loginSubmit
          )}
        </Button>
      </form>

      <div className="label-mono my-8 flex items-center gap-4 text-muted">
        <span className="h-px flex-1 bg-line" />
        {s.orDemo}
        <span className="h-px flex-1 bg-line" />
      </div>

      <div className="grid gap-2.5">
        {ROLES.map((role) => (
          <button
            key={role}
            type="button"
            disabled={pending != null}
            onClick={() => demo(role)}
            className="group flex min-w-0 items-center gap-3.5 rounded-2xl bg-surface p-3 pr-4 text-left ring-1 ring-line-strong transition-[box-shadow,transform] duration-200 hover:ring-2 hover:ring-brand-ink active:scale-[0.98] disabled:opacity-60"
          >
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold ${
                role === 'patient' ? 'bg-brand-soft text-brand-ink' : 'bg-hero text-on-hero'
              }`}
            >
              {pending === role ? <Spinner /> : role === 'patient' ? 'ML' : 'DL'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{s.demoAs[role].title}</span>
              <span className="block truncate text-sm text-muted">{s.demoAs[role].sub}</span>
            </span>
            <ArrowRight size={16} className="shrink-0 text-muted transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-brand-ink" />
          </button>
        ))}
      </div>
    </AuthLayout>
  )
}

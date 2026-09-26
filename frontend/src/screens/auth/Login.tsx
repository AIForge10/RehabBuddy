import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthError } from '../../api/auth'
import { Button } from '../../components/Screen'
import { useAuth } from '../../lib/auth'
import type { Strings } from '../../lib/i18n'
import { useLanguage } from '../../lib/language'
import type { Role } from '../../types/session'
import { AuthLayout, EMAIL_RE, Field, FormError, PasswordField, Spinner } from './AuthLayout'

// Errors are kept as string keys, not text, so flipping EN/ES re-translates them.
type ErrKey = keyof Pick<Strings, 'errEmail' | 'errPasswordEmpty' | 'errInvalid' | 'errGeneric'>
const ROLES: Role[] = ['patient', 'therapist']

export default function Login() {
  const { s } = useLanguage()
  const { signIn, demoSignIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: ErrKey; password?: ErrKey; form?: ErrKey }>({})
  const [pending, setPending] = useState<'form' | Role | null>(null)

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
        <Button type="submit" disabled={pending != null} className="mt-1 w-full font-display">
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

      <div className="my-7 flex items-center gap-4 text-sm font-semibold text-muted">
        <span className="h-px flex-1 bg-line" />
        {s.orDemo}
        <span className="h-px flex-1 bg-line" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {ROLES.map((role) => (
          <button
            key={role}
            type="button"
            disabled={pending != null}
            onClick={() => demo(role)}
            className="group flex min-w-0 items-center gap-3 rounded-2xl bg-surface p-3 text-left shadow-card ring-1 ring-line transition-[box-shadow,transform] duration-200 hover:ring-2 hover:ring-brand active:scale-[0.98] disabled:opacity-60"
          >
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold ${
                role === 'patient' ? 'bg-brand-soft text-brand-ink' : 'bg-hero text-on-hero'
              }`}
            >
              {pending === role ? <Spinner /> : role === 'patient' ? 'ML' : 'DL'}
            </span>
            <span className="min-w-0">
              <span className="block font-bold">{s.demoAs[role].title}</span>
              <span className="block truncate text-[13px] text-muted">{s.demoAs[role].sub}</span>
            </span>
          </button>
        ))}
      </div>
    </AuthLayout>
  )
}

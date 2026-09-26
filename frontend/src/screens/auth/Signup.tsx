import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthError } from '../../api/auth'
import { LegMark } from '../../components/Logo'
import { Button } from '../../components/Screen'
import { useAuth } from '../../lib/auth'
import type { Strings } from '../../lib/i18n'
import { useLanguage } from '../../lib/language'
import type { Role } from '../../types/session'
import { AuthLayout, EMAIL_RE, Field, FormError, PasswordField, Spinner } from './AuthLayout'

type ErrKey = keyof Pick<Strings, 'errName' | 'errEmail' | 'errPassword' | 'errTaken' | 'errGeneric'>
const MIN_PASSWORD = 8
const ROLES: Role[] = ['patient', 'therapist']

export default function Signup() {
  const { s, lang } = useLanguage()
  const { signUp } = useAuth()
  const [role, setRole] = useState<Role>('patient')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ name?: ErrKey; email?: ErrKey; password?: ErrKey; form?: ErrKey }>({})
  const [pending, setPending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (!name.trim()) next.name = 'errName'
    if (!EMAIL_RE.test(email.trim())) next.email = 'errEmail'
    if (password.length < MIN_PASSWORD) next.password = 'errPassword'
    setErrors(next)
    if (next.name || next.email || next.password) return
    setPending(true)
    try {
      await signUp({ full_name: name, email, password, role, language: lang })
    } catch (err) {
      if (err instanceof AuthError && err.code === 'taken') setErrors({ email: 'errTaken' })
      else setErrors({ form: 'errGeneric' })
      setPending(false)
    }
  }

  return (
    <AuthLayout
      title={s.signupTitle}
      sub={s.signupSub}
      footer={
        <>
          {s.haveAccount}{' '}
          <Link to="/login" className="font-bold text-brand-ink underline-offset-4 hover:underline">
            {s.navLogin}
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-5">
        {errors.form && <FormError>{s[errors.form]}</FormError>}

        <fieldset>
          <legend className="text-[15px] font-semibold">{s.roleLabel}</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-3">
            {ROLES.map((r) => (
              <label
                key={r}
                className="relative flex cursor-pointer flex-col rounded-2xl bg-surface p-4 ring-1 ring-line-strong hover:ring-ink/30 transition-[box-shadow,background-color] duration-200 has-checked:bg-brand-soft has-checked:ring-2 has-checked:ring-brand-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-ink"
              >
                <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="peer sr-only" />
                <span className="grid size-10 place-items-center rounded-xl bg-raised text-brand-ink ring-1 ring-line peer-checked:bg-brand peer-checked:text-on-brand peer-checked:ring-0">
                  {r === 'patient' ? (
                    <LegMark className="h-6 w-auto" />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 19V5m0 14h16M8 15l3.5-4 3 2.5L20 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="mt-3 font-bold">{s.roles[r].title}</span>
                <span className="text-[13px] leading-snug text-muted">{s.roles[r].sub}</span>
                <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full ring-2 ring-line-strong peer-checked:bg-brand-ink peer-checked:ring-brand-ink">
                  <span className="size-2 rounded-full bg-surface" />
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label={s.fullName} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name && s[errors.name]} />
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password && s[errors.password]}
          hint={s.passwordHint}
        />
        <Button type="submit" disabled={pending} className="mt-1 w-full">
          {pending ? (
            <>
              <Spinner />
              {s.signingUp}
            </>
          ) : (
            s.signupSubmit
          )}
        </Button>
      </form>
    </AuthLayout>
  )
}

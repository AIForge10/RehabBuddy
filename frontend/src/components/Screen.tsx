import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { AccountMenu } from './AccountMenu'
import { LanguageToggle } from './LanguageToggle'
import { Logo } from './Logo'

/** Page frame for the patient-facing screens. */
export function PatientScreen({ children, wide = false, right }: { children: ReactNode; wide?: boolean; right?: ReactNode }) {
  const width = wide ? 'max-w-6xl' : 'max-w-xl'
  return (
    <div className="min-h-dvh pb-[env(safe-area-inset-bottom)]">
      <header className={`mx-auto flex items-center justify-between gap-4 px-5 pb-2 pt-[max(1.25rem,env(safe-area-inset-top))] ${width}`}>
        <Logo />
        <div className="flex items-center gap-3">
          <LanguageToggle />
          {right}
          <AccountMenu />
        </div>
      </header>
      <main className={`mx-auto animate-rise px-5 pb-16 ${width}`}>{children}</main>
    </div>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonSize = 'md' | 'lg'

/** Button styling, shared with links that should look like buttons. */
export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'lg') {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-[background-color,box-shadow,transform,opacity] duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40'
  const sizes = { md: 'h-12 px-5 text-base', lg: 'h-14 px-7 text-lg' }
  const variants = {
    primary:
      'bg-brand text-on-brand shadow-[0_1px_0_rgb(255_255_255/0.18)_inset,0_10px_28px_-12px_var(--rb-brand)] hover:bg-brand-strong hover:shadow-[0_1px_0_rgb(255_255_255/0.18)_inset,0_14px_32px_-12px_var(--rb-brand)]',
    secondary: 'bg-surface text-ink shadow-card ring-1 ring-line-strong hover:bg-raised',
    ghost: 'text-ink-2 hover:bg-raised hover:text-ink',
  }
  return `${base} ${sizes[size]} ${variants[variant]}`
}

export function Button({
  children,
  variant = 'primary',
  size = 'lg',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button className={`${buttonClass(variant, size)} ${className}`} {...props}>
      {children}
    </button>
  )
}

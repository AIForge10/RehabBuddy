import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { AccountMenu } from './AccountMenu'
import { LanguageToggle } from './LanguageToggle'
import { Logo } from './Logo'

/** A flat panel: surface on a 1px line, no float. Shadows are for things that hover over the page. */
export const PANEL = 'rounded-3xl bg-surface ring-1 ring-line'

/** Every signed-in screen's h1, so titles match page to page. */
export const TITLE = 'font-display text-[34px] leading-[1.06] sm:text-[44px]'

/**
 * Page frame for the patient-facing screens. The header is always full width,
 * so the logo and account stay put from screen to screen; narrow screens
 * center a reading column under it.
 */
export function PatientScreen({ children, wide = false, right }: { children: ReactNode; wide?: boolean; right?: ReactNode }) {
  return (
    <div className="min-h-dvh pb-[env(safe-area-inset-bottom)]">
      <StatusBarScrim />
      <header className="mx-auto flex h-[calc(72px+env(safe-area-inset-top))] max-w-6xl items-center justify-between gap-4 px-5 pt-[env(safe-area-inset-top)]">
        <Logo />
        <div className="flex items-center gap-3">
          <LanguageToggle />
          {right}
          <AccountMenu />
        </div>
      </header>
      <main className="mx-auto max-w-6xl animate-rise px-5 pb-20">
        {wide ? children : <div className="mx-auto max-w-[36rem]">{children}</div>}
      </main>
    </div>
  )
}

/**
 * Edge to edge (the mobile app), a page scrolls under the status bar; this
 * keeps the clock readable over it. It is 0 tall in a browser tab.
 */
export function StatusBarScrim() {
  return <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-30 h-[env(safe-area-inset-top)] bg-canvas/85 backdrop-blur-xl" />
}

/** Title block for a screen: optional kicker line, the h1 and one sentence under it. */
export function PageHeader({ kicker, title, sub, className = '' }: { kicker?: ReactNode; title: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={`pt-6 sm:pt-10 ${className}`}>
      {kicker && <div className="mb-3">{kicker}</div>}
      <h1 className={TITLE}>{title}</h1>
      {sub && <p className="mt-3 text-lg leading-relaxed text-ink-2">{sub}</p>}
    </div>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'ink' | 'on-dark'
type ButtonSize = 'md' | 'lg'

/** Button styling, shared with links that should look like buttons. */
export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'lg') {
  const base =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-bold transition-[background-color,box-shadow,color,transform,opacity] duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40'
  const sizes = { md: 'h-11 px-4 text-[15px]', lg: 'h-14 px-6 text-[17px]' }
  const variants = {
    // The inset top edge gives the flat teal a pressed-metal crispness without a glow.
    primary: 'bg-brand text-on-brand shadow-[inset_0_1px_0_rgb(255_255_255/0.22)] hover:bg-brand-strong',
    secondary: 'bg-surface text-ink ring-1 ring-line-strong hover:bg-raised hover:ring-ink/30',
    ghost: 'text-ink-2 hover:bg-raised hover:text-ink',
    // Near-black, for the one action on a light page that should outrank the brand color.
    ink: 'bg-ink text-canvas hover:bg-ink/85',
    // Secondary on the near-black brand panels and the stage.
    'on-dark': 'bg-white/8 text-on-hero ring-1 ring-white/15 hover:bg-white/14 hover:ring-white/25 focus-visible:outline-brand-light',
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

export function ArrowRight({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" className={className}>
      <path d="M3.5 9h11m-4.5-4.5L14.5 9 10 13.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

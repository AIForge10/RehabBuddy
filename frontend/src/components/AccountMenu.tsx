import { useEffect, useId, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

/** Avatar button with the signed-in account and a log-out action. `english` for the English-only therapist view. */
export function AccountMenu({ english = false }: { english?: boolean }) {
  const { account, signOut } = useAuth()
  const { s: current } = useLanguage()
  const s = english ? t('en') : current
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!account) return null

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={s.account}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="grid size-11 place-items-center rounded-full bg-hero text-sm font-bold text-on-hero shadow-card ring-1 ring-white/10 transition-transform duration-200 active:scale-95"
      >
        {initials(account.full_name)}
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-64 origin-top-right animate-rise rounded-2xl bg-surface p-1.5 shadow-lift ring-1 ring-line"
        >
          <div className="px-3 pb-2.5 pt-2">
            <p className="truncate font-bold">{account.full_name}</p>
            <p className="truncate text-sm text-muted">{account.email}</p>
          </div>
          <div className="h-px bg-line" />
          <button
            type="button"
            onClick={signOut}
            className="mt-1.5 flex h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left font-semibold text-ink-2 transition-colors hover:bg-raised hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8m4.5-9.5L16 10l-3.5 3.5M16 10H8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {s.logOut}
          </button>
        </div>
      )}
    </div>
  )
}

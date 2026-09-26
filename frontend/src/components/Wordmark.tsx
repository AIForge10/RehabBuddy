import { Link } from 'react-router-dom'

export function Wordmark({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M6 2.5v7.5l6 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="6" cy="10" r="2.5" className="fill-accent" />
      </svg>
      RehabBuddy
    </Link>
  )
}

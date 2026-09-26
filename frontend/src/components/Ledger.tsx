import type { ReactNode } from 'react'

// The ruled layout for results: a section opens on a heavy rule with its
// title, and facts sit in hairline rows beneath. Shared by the home recap,
// the session summary and the therapist's patient view, so a number reads
// the same wherever it appears.

export function Section({
  title,
  aside,
  className = '',
  children,
}: {
  title: ReactNode
  aside?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`animate-rise border-t-2 border-ink pt-4 [animation-delay:90ms] ${className}`}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="min-w-0 truncate text-lg font-bold">{title}</h2>
        {aside && <div className="shrink-0 whitespace-nowrap text-sm font-semibold text-ink-2">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

export function Rows({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <dl className={`divide-y divide-line border-y border-line ${className}`}>{children}</dl>
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-12 items-center justify-between gap-4">
      <dt className="shrink-0 text-[15px] text-ink-2">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[15px] font-bold tabular-nums">{children}</dd>
    </div>
  )
}

/** Small dot in the pain band's color; the number beside it carries the meaning. */
export function PainDot({ score }: { score: number }) {
  return (
    <span
      aria-hidden="true"
      className={`mr-2 inline-block size-2 rounded-full align-middle ${score <= 3 ? 'bg-pain-1' : score <= 6 ? 'bg-pain-2' : 'bg-pain-3'}`}
    />
  )
}

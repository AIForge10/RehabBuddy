import { useRef } from 'react'
import { BODY_PARTS, EXERCISES, type BodyPart } from '../lib/exercises'
import { useLanguage } from '../lib/language'

// Which joint the session works: a radio group styled like the language
// toggle. Arrow keys move the choice, as in any radio group. On phones the
// five options share the width equally, so none is ever out of view.

const LABEL = { en: 'Body part', es: 'Parte del cuerpo' }

export function JointPicker({ value, onChange }: { value: BodyPart; onChange: (part: BodyPart) => void }) {
  const { lang } = useLanguage()
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const move = (from: number, step: number) => {
    const i = (from + step + BODY_PARTS.length) % BODY_PARTS.length
    onChange(BODY_PARTS[i])
    refs.current[i]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={LABEL[lang]}
      className="grid grid-cols-5 gap-1 rounded-full bg-surface p-1 shadow-card ring-1 ring-line sm:inline-flex"
    >
      {BODY_PARTS.map((part, i) => {
        const on = part === value
        return (
          <button
            key={part}
            ref={(el) => {
              refs.current[i] = el
            }}
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(part)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(i, 1)
              else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(i, -1)
              else return
              e.preventDefault()
            }}
            className={`h-10 min-w-0 whitespace-nowrap rounded-full px-1 text-[13px] font-bold transition-colors duration-200 sm:px-4 sm:text-[15px] ${
              on ? 'bg-brand text-on-brand' : 'text-ink-2 hover:bg-raised hover:text-ink'
            }`}
          >
            {EXERCISES[part].copy[lang].part}
          </button>
        )
      })}
    </div>
  )
}

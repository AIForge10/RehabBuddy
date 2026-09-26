import { useLayoutEffect, useRef } from 'react'

// A highlight that slides to the chosen item, the way the language toggle's
// pill does, for items of any size: it's measured onto the item and moved
// there with a transform, so the element's own CSS transition animates the
// trip. It re-measures whenever an item resizes (a language switch, a new
// layout), and lands on its first item without sliding in from the corner.
//
// The highlight and the items must share an offset parent: give their common
// container `relative`, and the highlight `absolute left-0 top-0`.

export function useHighlight<T extends HTMLElement>(index: number) {
  const highlight = useRef<HTMLElement | null>(null)
  const items = useRef<(T | null)[]>([])
  const placed = useRef(false)

  useLayoutEffect(() => {
    const el = highlight.current
    const on = items.current[index]
    if (!el || !on) return
    const place = () => {
      el.style.width = `${on.offsetWidth}px`
      el.style.height = `${on.offsetHeight}px`
      el.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`
    }
    if (placed.current) {
      place()
    } else {
      el.style.transition = 'none'
      place()
      void el.offsetWidth // commit the first spot before transitions come back
      el.style.transition = ''
      placed.current = true
    }
    const resize = new ResizeObserver(place)
    for (const item of items.current) if (item) resize.observe(item)
    return () => resize.disconnect()
  }, [index])

  return { highlight, items }
}

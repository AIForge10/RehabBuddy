import { useRef } from 'react'

export function useRandomSelector<T>(items: T[]): () => T {
  const lastValueRef = useRef<T | null>(null)
  const uniqueItems = Array.from(new Set(items))

  return () => {
    if (uniqueItems.length === 0) return items[0]
    if (uniqueItems.length === 1) return uniqueItems[0]

    let nextValue: T
    do {
      const randomIndex = Math.floor(Math.random() * uniqueItems.length)
      nextValue = uniqueItems[randomIndex]
    } while (nextValue === lastValueRef.current)

    lastValueRef.current = nextValue
    return nextValue
  }
}
import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/** True when the OS asks for less motion; JS-driven loops should hold still. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia(QUERY).matches)
  useEffect(() => {
    const mq = matchMedia(QUERY)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

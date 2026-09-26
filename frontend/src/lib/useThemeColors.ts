import { useEffect, useState } from 'react'

// Recharts writes colors as SVG attributes, where CSS variables aren't
// reliable, so read the resolved token values and refresh on theme change.
const KEYS = ['brand', 'brand-soft', 'surface', 'line', 'muted', 'ink', 'ink-2', 'critical'] as const
export type ThemeColors = Record<(typeof KEYS)[number], string>

function read(): ThemeColors {
  const css = getComputedStyle(document.documentElement)
  return Object.fromEntries(KEYS.map((k) => [k, css.getPropertyValue(`--rb-${k}`).trim()])) as ThemeColors
}

export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState(read)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setColors(read())
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return colors
}

import { useSyncExternalStore } from 'react'

// The theme and accent colour are per-browser preferences, kept in localStorage.

export type ThemeMode = 'light' | 'dark' | 'system'

export const ACCENTS = [
  { id: 'indigo', label: 'Indigo', swatch: 'oklch(0.51 0.19 265)' },
  { id: 'teal', label: 'Teal', swatch: 'oklch(0.52 0.1 195)' },
  { id: 'emerald', label: 'Emerald', swatch: 'oklch(0.52 0.13 160)' },
  { id: 'orange', label: 'Orange', swatch: 'oklch(0.56 0.17 45)' },
  { id: 'rose', label: 'Rose', swatch: 'oklch(0.53 0.19 15)' },
  { id: 'slate', label: 'Slate', swatch: 'oklch(0.27 0 0)' },
] as const

export type Accent = (typeof ACCENTS)[number]['id']

export type Appearance = { mode: ThemeMode; accent: Accent }

const STORAGE_KEY = 'stockflow.appearance'
const DEFAULT_APPEARANCE: Appearance = { mode: 'system', accent: 'indigo' }

function load(): Appearance {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    const mode = ['light', 'dark', 'system'].includes(stored.mode) ? stored.mode : undefined
    const accent = ACCENTS.some((a) => a.id === stored.accent) ? stored.accent : undefined
    return { ...DEFAULT_APPEARANCE, ...(mode && { mode }), ...(accent && { accent }) }
  } catch {
    return DEFAULT_APPEARANCE
  }
}

let current = load()
const listeners = new Set<() => void>()
const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)')

export function isDark(appearance: Appearance = current): boolean {
  return appearance.mode === 'dark' || (appearance.mode === 'system' && !!systemDark?.matches)
}

// Writes the choice onto <html>: the "dark" class and a data-accent attribute the CSS reads.
export function applyAppearance(): void {
  const root = document.documentElement
  root.classList.toggle('dark', isDark())
  if (current.accent === DEFAULT_APPEARANCE.accent) delete root.dataset.accent
  else root.dataset.accent = current.accent
}

export function setAppearance(changes: Partial<Appearance>): void {
  current = { ...current, ...changes }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // Private windows can refuse storage; the choice still applies until reload.
  }
  applyAppearance()
  listeners.forEach((listener) => listener())
}

systemDark?.addEventListener('change', () => {
  applyAppearance()
  listeners.forEach((listener) => listener())
})

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, () => current)
}

export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, () => isDark())
}

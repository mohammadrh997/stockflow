import { afterEach, describe, expect, it } from 'vitest'

import { setAppearance } from './appearance'

const root = document.documentElement

describe('appearance', () => {
  afterEach(() => {
    setAppearance({ mode: 'light', accent: 'indigo' })
  })

  it('switches dark mode on the page', () => {
    setAppearance({ mode: 'dark' })
    expect(root).toHaveClass('dark')

    setAppearance({ mode: 'light' })
    expect(root).not.toHaveClass('dark')
  })

  it('sets the accent, leaving the default indigo without an attribute', () => {
    setAppearance({ accent: 'teal' })
    expect(root.dataset.accent).toBe('teal')

    setAppearance({ accent: 'indigo' })
    expect(root.dataset.accent).toBeUndefined()
  })

  it('remembers the choice in this browser', () => {
    setAppearance({ mode: 'dark', accent: 'rose' })

    expect(JSON.parse(localStorage.getItem('stockflow.appearance')!)).toEqual({
      mode: 'dark',
      accent: 'rose',
    })
  })
})

import { describe, expect, it } from 'vitest'

import { addDays, formatDate, today } from './dates'

describe('calendar dates', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-11-08', 30)).toBe('2026-12-08')
    expect(addDays('2026-12-20', 15)).toBe('2027-01-04')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('formats a date without shifting the day', () => {
    expect(formatDate('2026-11-08')).toContain('8')
    expect(formatDate('2026-11-08')).toContain('2026')
  })

  it('gives today as YYYY-MM-DD', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

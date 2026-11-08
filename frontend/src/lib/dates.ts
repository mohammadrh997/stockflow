// Invoice and payment dates are calendar dates ("2026-11-08"), not moments in time. Read as a
// timestamp they'd shift a day for anyone west of UTC, so they are formatted as UTC dates.

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' })

export function formatDate(value: string): string {
  return dateFormat.format(new Date(`${value}T00:00:00Z`))
}

// Today in the user's own time zone, as "YYYY-MM-DD".
export function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

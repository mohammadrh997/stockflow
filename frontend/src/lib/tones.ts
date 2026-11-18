// The status tones defined in index.css, as the classes a badge or pill needs.
// One place decides what "done" or "waiting" looks like, in light and dark.
export type Tone = 'neutral' | 'success' | 'warning' | 'info' | 'danger'

export const TONE_BADGE: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-success-soft text-success-strong',
  warning: 'bg-warning-soft text-warning-strong',
  info: 'bg-info-soft text-info-strong',
  danger: 'bg-danger-soft text-danger-strong',
}

// For text straight on the page, such as a note under a field or a signed quantity.
export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-muted-foreground',
  success: 'text-success-text',
  warning: 'text-warning-text',
  info: 'text-info-text',
  danger: 'text-danger-text',
}

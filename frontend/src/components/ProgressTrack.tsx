import { Check, X } from 'lucide-react'

import { cn } from '@/lib/utils'

type Props = {
  // In order, e.g. ['draft', 'confirmed', 'received'].
  steps: string[]
  state: string
}

// Where a document is in its life: done steps are ticked, the current one is filled.
// A cancelled document shows the track greyed out with a separate "Cancelled" marker.
export function ProgressTrack({ steps, state }: Props) {
  const cancelled = state === 'cancelled'
  const current = steps.indexOf(state)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ol
        aria-label="Progress"
        className={cn(
          'inline-flex items-center gap-0.5 rounded-full border bg-muted/50 p-1 text-sm',
          cancelled && 'opacity-60',
        )}
      >
        {steps.map((step, index) => {
          const done = !cancelled && index < current
          const active = !cancelled && index === current
          return (
            <li
              key={step}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1 capitalize',
                active && 'bg-primary font-medium text-primary-foreground shadow-sm',
                done && 'text-foreground',
                !active && !done && 'text-muted-foreground',
              )}
            >
              {done && <Check className="size-3.5 text-primary" />}
              {step}
            </li>
          )
        })}
      </ol>
      {cancelled && (
        <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive">
          <X className="size-3.5" />
          Cancelled
        </span>
      )}
    </div>
  )
}

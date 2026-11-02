import { Check, X } from 'lucide-react'

import { cn } from '@/lib/utils'

type Props = {
  // In order, e.g. ['draft', 'confirmed', 'received'].
  steps: string[]
  state: string
}

// Where the order is in its life. A cancelled order shows the steps greyed out.
export function OrderSteps({ steps, state }: Props) {
  const cancelled = state === 'cancelled'
  const current = steps.indexOf(state)

  return (
    <ol aria-label="Order progress" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      {steps.map((step, index) => {
        const done = !cancelled && index < current
        const active = !cancelled && index === current
        return (
          <li
            key={step}
            aria-current={active ? 'step' : undefined}
            className="flex items-center gap-3"
          >
            {index > 0 && <span aria-hidden className="h-px w-6 bg-border sm:w-10" />}
            <span
              className={cn(
                'flex items-center gap-2 capitalize',
                active ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full border text-xs',
                  done && 'border-primary bg-primary text-primary-foreground',
                  active && 'border-primary text-primary',
                )}
              >
                {done ? <Check className="size-3.5" /> : index + 1}
              </span>
              {step}
            </span>
          </li>
        )
      })}
      {cancelled && (
        <li className="flex items-center gap-2 font-medium text-destructive">
          <span aria-hidden className="h-px w-6 bg-border sm:w-10" />
          <X className="size-4" />
          Cancelled
        </li>
      )}
    </ol>
  )
}

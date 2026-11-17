import { CircleAlert, Info } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { ImportWarning } from './queries'

// What's in the way of creating the order, then what's merely worth a look. The server
// works these out on every change, so they always match what's on screen.
export function ImportWarnings({ warnings }: { warnings: ImportWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <ul aria-label="Before creating the order" className="grid gap-2">
      {warnings.map((warning) => (
        <li
          key={warning.code}
          className={cn(
            'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
            warning.blocks_confirm
              ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100'
              : 'bg-muted/60',
          )}
        >
          {warning.blocks_confirm ? (
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span>
            {warning.message}
            {/* Heard and seen: whether it stops the order being created. */}
            <span
              className={cn(
                'ml-2',
                warning.blocks_confirm ? 'font-medium' : 'text-muted-foreground',
              )}
            >
              {warning.blocks_confirm ? '(needed)' : '(check)'}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

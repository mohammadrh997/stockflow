import { CircleAlert, Info } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
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
              ? 'border-warning-text/40 bg-warning-soft text-warning-strong'
              : 'bg-muted/60',
          )}
        >
          {warning.blocks_confirm ? (
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className="min-w-0 flex-1">{warning.message}</span>
          {/* Seen and heard: whether it stops the order being created. */}
          <Badge
            variant="outline"
            className={cn(
              'shrink-0',
              warning.blocks_confirm ? 'border-warning-text/50' : 'text-muted-foreground',
            )}
          >
            {warning.blocks_confirm ? 'Required' : 'Check'}
          </Badge>
        </li>
      ))}
    </ul>
  )
}

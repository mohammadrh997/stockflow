import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  ready: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  confirmed: 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200',
  received: 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200',
  delivered: 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200',
  done: 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200',
  cancelled: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
}

export function StateBadge({ state }: { state: string }) {
  return (
    <Badge className={cn('capitalize', STYLES[state] ?? 'bg-muted text-muted-foreground')}>
      {state}
    </Badge>
  )
}

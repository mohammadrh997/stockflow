import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  ready: 'bg-amber-100 text-amber-900',
  confirmed: 'bg-blue-100 text-blue-900',
  received: 'bg-green-100 text-green-900',
  delivered: 'bg-green-100 text-green-900',
  done: 'bg-green-100 text-green-900',
  cancelled: 'bg-red-100 text-red-900',
}

export function StateBadge({ state }: { state: string }) {
  return (
    <Badge className={cn('capitalize', STYLES[state] ?? 'bg-muted text-muted-foreground')}>
      {state}
    </Badge>
  )
}

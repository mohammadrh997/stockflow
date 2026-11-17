import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { BillImportState } from './queries'

const LABELS: Record<BillImportState, string> = {
  open: 'To review',
  done: 'Order created',
  discarded: 'Discarded',
}

const STYLES: Record<BillImportState, string> = {
  open: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  done: 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200',
  discarded: 'bg-muted text-muted-foreground',
}

export function ImportStateBadge({ state }: { state: BillImportState }) {
  return <Badge className={cn(STYLES[state])}>{LABELS[state]}</Badge>
}

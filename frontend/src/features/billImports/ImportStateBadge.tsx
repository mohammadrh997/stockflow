import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { TONE_BADGE } from '@/lib/tones'
import type { BillImportState } from './queries'

const LABELS: Record<BillImportState, string> = {
  open: 'To review',
  done: 'Order created',
  discarded: 'Discarded',
}

const STYLES: Record<BillImportState, string> = {
  open: TONE_BADGE.warning,
  done: TONE_BADGE.success,
  discarded: TONE_BADGE.neutral,
}

export function ImportStateBadge({ state }: { state: BillImportState }) {
  return <Badge className={cn(STYLES[state])}>{LABELS[state]}</Badge>
}

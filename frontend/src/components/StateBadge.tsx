import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { TONE_BADGE } from '@/lib/tones'

const STYLES: Record<string, string> = {
  draft: TONE_BADGE.neutral,
  ready: TONE_BADGE.warning,
  confirmed: TONE_BADGE.info,
  posted: TONE_BADGE.info,
  received: TONE_BADGE.success,
  delivered: TONE_BADGE.success,
  done: TONE_BADGE.success,
  cancelled: TONE_BADGE.danger,
}

export function StateBadge({ state }: { state: string }) {
  return <Badge className={cn('capitalize', STYLES[state] ?? TONE_BADGE.neutral)}>{state}</Badge>
}

import { Quantity } from '@/components/Quantity'
import { Badge } from '@/components/ui/badge'
import { TONE_BADGE, TONE_TEXT } from '@/lib/tones'
import { cn } from '@/lib/utils'

// What's free to sell. Nothing free (the start page's "short on stock") is said in words,
// not colour alone.
export function AvailableQuantity({ value }: { value: string }) {
  if (Number(value) <= 0) {
    return (
      <span className="inline-flex items-center justify-end gap-2">
        <Badge className={TONE_BADGE.danger}>None free</Badge>
        <span className={cn('font-medium', TONE_TEXT.danger)}>
          <Quantity value={value} />
        </span>
      </span>
    )
  }
  return (
    <span className="font-medium">
      <Quantity value={value} />
    </span>
  )
}

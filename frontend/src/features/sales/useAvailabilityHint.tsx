import { formatQuantity } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useStock } from '@/features/stock/queries'
import type { LineHint } from '@/features/orders/types'

// A guide while editing a draft; the server checks stock again when the order is confirmed.
export function useAvailabilityHint(warehouseId: number | undefined, enabled: boolean): LineHint {
  const stock = useStock({ warehouse_id: warehouseId }, { enabled: enabled && !!warehouseId })

  return function hint(productId: number) {
    if (stock.isPending) return 'Checking stock…'
    if (stock.isError) return 'Stock unavailable'
    const row = stock.data.find((r) => r.product_id === productId)
    const available = row?.available ?? '0'
    return (
      <span className={cn(Number(available) <= 0 && 'text-destructive')}>
        {formatQuantity(available)} available in this warehouse
      </span>
    )
  }
}

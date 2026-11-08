import { useTransfers, type Transfer, type TransferListParams } from '@/features/transfers/queries'
import { sumQuantities } from '@/lib/quantity'

const ORDER_TRANSFERS_LIMIT = 100

export type OrderTransfers = {
  transfers: Transfer[]
  // Per order line id: what already moved, and what still waits on a ready transfer.
  moved: (orderLineId: number) => string
  waiting: (orderLineId: number) => string
  hasMoved: boolean
  backorderWaiting: boolean
}

function orderLineOf(line: Transfer['lines'][number]): number | null {
  return line.purchase_line_id ?? line.sales_line_id
}

function totals(transfers: Transfer[]): (orderLineId: number) => string {
  const byLine = new Map<number, string[]>()
  for (const transfer of transfers) {
    for (const line of transfer.lines) {
      const orderLineId = orderLineOf(line)
      if (orderLineId === null) continue
      byLine.set(orderLineId, [...(byLine.get(orderLineId) ?? []), line.quantity])
    }
  }
  return (orderLineId) => sumQuantities(byLine.get(orderLineId) ?? [])
}

// The receipts or deliveries of one order, oldest first. A done transfer's lines list what it
// moved; a ready one's what it still has to move.
export function useOrderTransfers(
  filter: Pick<TransferListParams, 'purchase_order_id' | 'sales_order_id'>,
  enabled: boolean,
) {
  const query = useTransfers({ ...filter, limit: ORDER_TRANSFERS_LIMIT }, { enabled })
  const transfers = [...(query.data ?? [])].sort((a, b) => a.id - b.id)
  const done = transfers.filter((t) => t.state === 'done')
  const ready = transfers.filter((t) => t.state === 'ready')

  const result: OrderTransfers = {
    transfers,
    moved: totals(done),
    waiting: totals(ready),
    hasMoved: done.length > 0,
    backorderWaiting: ready.some((t) => t.backorder_of_id !== null),
  }
  return { ...result, isPending: query.isPending && enabled }
}

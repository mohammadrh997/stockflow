import { useInvoices, type Invoice, type InvoiceListParams } from '@/features/invoices/queries'
import { compareQuantities, sumQuantities } from '@/lib/quantity'

const ORDER_INVOICES_LIMIT = 100

function orderLineOf(line: Invoice['lines'][number]): number | null {
  return line.purchase_line_id ?? line.sales_line_id
}

// The invoices or bills of one order, oldest first, and per order line what they invoice.
// Cancelled invoices no longer count, as on the server.
export function useOrderInvoices(
  filter: Pick<InvoiceListParams, 'purchase_order_id' | 'sales_order_id'>,
  enabled: boolean,
) {
  const query = useInvoices({ ...filter, limit: ORDER_INVOICES_LIMIT }, { enabled })
  const invoices = [...(query.data ?? [])].sort((a, b) => a.id - b.id)

  const byLine = new Map<number, string[]>()
  for (const invoice of invoices) {
    if (invoice.state === 'cancelled') continue
    for (const line of invoice.lines) {
      const orderLineId = orderLineOf(line)
      if (orderLineId === null) continue
      byLine.set(orderLineId, [...(byLine.get(orderLineId) ?? []), line.quantity])
    }
  }

  return {
    invoices,
    invoiced: (orderLineId: number) => sumQuantities(byLine.get(orderLineId) ?? []),
    isPending: query.isPending && enabled,
  }
}

export type OrderInvoices = ReturnType<typeof useOrderInvoices>

// Why there is nothing to invoice yet, when the moves are known (they need inventory access).
export function nothingToInvoiceReason(
  kind: 'receipt' | 'delivery',
  lines: { id: number }[],
  transfers: { hasMoved: boolean; moved: (orderLineId: number) => string } | null,
  invoiced: (orderLineId: number) => string,
): string | null {
  if (transfers === null) return null
  const word = kind === 'receipt' ? 'received' : 'delivered'
  if (!transfers.hasMoved) return `Nothing ${word} yet.`
  const left = lines.some(
    (line) => compareQuantities(transfers.moved(line.id), invoiced(line.id)) > 0,
  )
  return left ? null : `Everything ${word} is already invoiced.`
}

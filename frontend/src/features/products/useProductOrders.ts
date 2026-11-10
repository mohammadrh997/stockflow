import { useQuery } from '@tanstack/react-query'

import { api } from '@/api/client'
import { unwrap } from '@/api/errors'
import type { PurchaseOrder } from '@/features/purchase/queries'
import type { SalesOrder } from '@/features/sales/queries'
import { sumQuantities } from '@/lib/quantity'

// The API's largest page.
const PAGE = 100
// A stop so a huge history can't keep the page busy (3,000 orders, oldest first, as the API
// sorts them); past it, counts say "at least". The button's note repeats this number.
const MAX_PAGES = 30

type Order = SalesOrder | PurchaseOrder

export type ProductOrder = {
  id: number
  reference: string
  state: string
  quantity: string
}

export type ProductOrders = {
  orders: ProductOrder[]
  // What confirmed and finished orders hold: quotations and drafts don't count yet.
  committed: string
  // True when MAX_PAGES was reached and older orders weren't looked at.
  partial: boolean
}

// The order lists can't be filtered by product yet, so every page is fetched and each
// order's lines are checked here. Replace with a product filter once the API has one.
async function scan(
  fetchPage: (skip: number) => Promise<Order[]>,
  productId: number,
): Promise<ProductOrders> {
  const orders: ProductOrder[] = []
  const committed: string[] = []
  let partial = false
  for (let page = 0; ; page += 1) {
    if (page === MAX_PAGES) {
      partial = true
      break
    }
    const rows = await fetchPage(page * PAGE)
    for (const order of rows) {
      if (order.state === 'cancelled') continue
      const lines = order.lines.filter((line) => line.product_id === productId)
      if (lines.length === 0) continue
      const quantity = sumQuantities(lines.map((line) => line.quantity))
      orders.push({ id: order.id, reference: order.reference, state: order.state, quantity })
      if (order.state !== 'draft') committed.push(quantity)
    }
    if (rows.length < PAGE) break
  }
  // Newest first, like the order lists.
  orders.sort((a, b) => b.id - a.id)
  return { orders, committed: sumQuantities(committed), partial }
}

export function useProductSalesOrders(productId: number, enabled: boolean) {
  return useQuery({
    // Under 'sales-orders', so any change to sales orders refreshes it.
    queryKey: ['sales-orders', 'with-product', productId],
    queryFn: () =>
      scan(
        (skip) => unwrap(api.GET('/sales-orders', { params: { query: { skip, limit: PAGE } } })),
        productId,
      ),
    enabled,
  })
}

export function useProductPurchaseOrders(productId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['purchase-orders', 'with-product', productId],
    queryFn: () =>
      scan(
        (skip) => unwrap(api.GET('/purchase-orders', { params: { query: { skip, limit: PAGE } } })),
        productId,
      ),
    enabled,
  })
}

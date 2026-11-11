import { useQuery } from '@tanstack/react-query'

import { api, type Schemas } from '@/api/client'
import { unwrap, unwrapWithTotal } from '@/api/errors'
import { sumQuantities } from '@/lib/quantity'

// The API's largest page: the popover lists at most this many of the newest orders.
const PAGE = 100

export type OrderKind = 'sales' | 'purchase'

export type ProductOrder = {
  id: number
  reference: string
  state: string
  quantity: string
}

export type ProductOrders = {
  // Every order holding the product, cancelled ones left out.
  count: number
  // The newest of them, newest first.
  orders: ProductOrder[]
  // False when there are more than one page holds, so only the newest are listed.
  complete: boolean
}

type Query = { product_id: number; skip?: number; limit: number; state?: 'cancelled' }

function fetchOrders(kind: OrderKind, query: Query) {
  return kind === 'sales'
    ? unwrapWithTotal(api.GET('/sales-orders', { params: { query } }))
    : unwrapWithTotal(api.GET('/purchase-orders', { params: { query } }))
}

async function load(kind: OrderKind, productId: number): Promise<ProductOrders> {
  // The lists run oldest first, so the newest orders sit on the last page.
  const first = await fetchOrders(kind, { product_id: productId, limit: PAGE })
  const [page, cancelled] = await Promise.all([
    first.total > PAGE
      ? fetchOrders(kind, { product_id: productId, skip: first.total - PAGE, limit: PAGE })
      : first,
    // The list can't leave cancelled orders out, but it can count them on their own.
    fetchOrders(kind, { product_id: productId, state: 'cancelled', limit: 1 }),
  ])
  const orders = page.data
    .filter((order) => order.state !== 'cancelled')
    .map((order) => ({
      id: order.id,
      reference: order.reference,
      state: order.state,
      quantity: sumQuantities(
        order.lines.filter((line) => line.product_id === productId).map((line) => line.quantity),
      ),
    }))
    .sort((a, b) => b.id - a.id)
  return {
    count: first.total - cancelled.total,
    orders,
    complete: first.total <= PAGE,
  }
}

export function useProductOrders(kind: OrderKind, productId: number, enabled: boolean) {
  return useQuery({
    // Under the order list's key, so any change to those orders refreshes it.
    queryKey: [`${kind}-orders`, 'with-product', productId],
    queryFn: () => load(kind, productId),
    enabled,
  })
}

export type ProductSummary = Schemas['ProductSummary']

// Stock moved in and out, and what confirmed orders hold, added up by the server. Each part
// is null when the user can't see that area.
export function useProductSummary(productId: number) {
  return useQuery({
    queryKey: ['products', productId, 'summary'],
    queryFn: () =>
      unwrap(
        api.GET('/products/{product_id}/summary', { params: { path: { product_id: productId } } }),
      ),
  })
}

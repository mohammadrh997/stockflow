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

type Query = { skip?: number; limit: number }

// Only the orders still holding the product: the server leaves cancelled ones out.
function fetchOrders(kind: OrderKind, productId: number, page: Query) {
  const query = { product_id: productId, exclude_cancelled: true, ...page }
  return kind === 'sales'
    ? unwrapWithTotal(api.GET('/sales-orders', { params: { query } }))
    : unwrapWithTotal(api.GET('/purchase-orders', { params: { query } }))
}

async function load(kind: OrderKind, productId: number): Promise<ProductOrders> {
  // The lists run oldest first, so the newest orders sit on the last page.
  const first = await fetchOrders(kind, productId, { limit: PAGE })
  const page =
    first.total > PAGE
      ? await fetchOrders(kind, productId, { skip: first.total - PAGE, limit: PAGE })
      : first
  const orders = page.data
    .map((order) => ({
      id: order.id,
      reference: order.reference,
      state: order.state,
      quantity: sumQuantities(
        order.lines.filter((line) => line.product_id === productId).map((line) => line.quantity),
      ),
    }))
    .sort((a, b) => b.id - a.id)
  return { count: first.total, orders, complete: first.total <= PAGE }
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

import { useQuery } from '@tanstack/react-query'

import { api, type Schemas } from '@/api/client'
import { unwrap, unwrapWithTotal } from '@/api/errors'
import { summaryKey } from '@/api/summaries'
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
  // The newest orders holding the product, newest first.
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

// How many orders hold the product: one row asked for, the total read from the header.
export function useProductOrderCount(kind: OrderKind, productId: number) {
  return useQuery({
    // Under the order list's key, so any change to those orders refreshes it.
    queryKey: [`${kind}-orders`, 'count-with-product', productId],
    queryFn: async () => (await fetchOrders(kind, productId, { limit: 1 })).total,
  })
}

// The orders themselves, only once someone opens the list. The lists run oldest first, so
// knowing the count, the newest page is asked for straight away.
export function useProductOrderList(
  kind: OrderKind,
  productId: number,
  count: number | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [`${kind}-orders`, 'with-product', productId, count],
    queryFn: async (): Promise<ProductOrders> => {
      const total = count ?? 0
      if (total === 0) return { orders: [], complete: true } // nothing to ask for
      const page = await fetchOrders(kind, productId, {
        skip: Math.max(0, total - PAGE),
        limit: PAGE,
      })
      const orders = page.data
        .map((order) => ({
          id: order.id,
          reference: order.reference,
          state: order.state,
          quantity: sumQuantities(
            order.lines
              .filter((line) => line.product_id === productId)
              .map((line) => line.quantity),
          ),
        }))
        .sort((a, b) => b.id - a.id)
      return { orders, complete: page.total <= PAGE }
    },
    enabled: enabled && count !== undefined,
  })
}

export type ProductSummary = Schemas['ProductSummary']

// Stock moved in and out, and what confirmed orders hold, added up by the server. Each part
// is null when the user can't see that area.
export function useProductSummary(productId: number) {
  return useQuery({
    queryKey: summaryKey('product', productId),
    queryFn: () =>
      unwrap(
        api.GET('/products/{product_id}/summary', { params: { path: { product_id: productId } } }),
      ),
  })
}

import { createContext } from 'react'
import { useLocation } from 'react-router'

import { api } from '@/api/client'
import { unwrapWithTotal } from '@/api/errors'

// The lists a record can be paged through. Each one takes skip and limit, and sends the
// total as X-Total-Count.
export type ListEndpoint =
  | '/purchase-orders'
  | '/sales-orders'
  | '/invoices'
  | '/transfers'
  | '/products'
  | '/partners'
  | '/bill-imports'

type Query = Record<string, string | number | boolean | undefined>

// What a list hands the record opened from it (in the router's location state), so the
// record can step to its neighbours and lead back to the same list.
export type ListContext = {
  // The API list to fetch neighbouring pages from. None for a list loaded whole (users,
  // warehouses, categories): its ids are all there already.
  endpoint?: ListEndpoint
  // The list's filters, without skip and limit.
  query?: Query
  // The page size; 0 for a list loaded whole.
  limit: number
  // Where the page holding the record starts, and the ids on it, in the list's order.
  skip: number
  ids: number[]
  // The list as it was left, filters and page included: where the breadcrumb leads.
  listHref: string
  // Where a record of this list lives, e.g. /purchase-orders (+ /7).
  recordBase: string
}

export type ListState = { list: ListContext }

// The context from a location's state, if it has one: a record opened another way
// (a link elsewhere, an address typed in) has no list to page through.
export function readListContext(state: unknown): ListContext | null {
  if (typeof state !== 'object' || state === null || !('list' in state)) return null
  const list = (state as { list: unknown }).list
  if (typeof list !== 'object' || list === null) return null
  const candidate = list as Partial<ListContext>
  return Array.isArray(candidate.ids) && typeof candidate.recordBase === 'string'
    ? (candidate as ListContext)
    : null
}

// One page of a list's ids, and how many records it has in all.
export async function fetchListPage(
  list: Pick<ListContext, 'endpoint' | 'query' | 'limit'>,
  skip: number,
): Promise<{ ids: number[]; total: number }> {
  if (!list.endpoint) throw new Error('This list is loaded whole; there is no other page')
  // Typed loosely on purpose: every list answers with records that have an id.
  const { data, total } = await unwrapWithTotal(
    api.GET(list.endpoint as '/bill-imports', {
      params: { query: { ...list.query, skip, limit: list.limit } as never },
    }),
  )
  return { ids: (data as { id: number }[]).map((row) => row.id), total }
}

// Where the breadcrumb should lead: the list the record was opened from, as it was left
// (its tab, filters and page), or the plain list.
export function useListHref(fallback: string): string {
  return readListContext(useLocation().state)?.listHref ?? fallback
}

// For a list page: what to hand each record opened from it (see ListContext). Undefined
// until the page's rows have loaded.
export function useListState(
  list: Omit<ListContext, 'ids' | 'listHref'>,
  rows: { id: number }[] | undefined,
): ListState | undefined {
  const location = useLocation()
  if (!rows) return undefined
  return {
    list: {
      ...list,
      ids: rows.map((row) => row.id),
      listHref: location.pathname + location.search,
    },
  }
}

// What a table hands the records its rows open: shared with the links inside the rows.
export const RowStateContext = createContext<unknown>(undefined)

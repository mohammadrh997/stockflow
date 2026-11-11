import { useInfiniteQuery } from '@tanstack/react-query'

import { api, type Schemas } from '@/api/client'
import { unwrap } from '@/api/errors'

const PAGE = 50

export type ProductMove = Schemas['MoveRead']
export type MoveKind = ProductMove['kind']

// One product's moves, newest first, a page at a time ("Load more" asks for the next).
export function useProductMoves(productId: number) {
  const query = useInfiniteQuery({
    // Under 'transfers', so validating or cancelling anything refreshes it.
    queryKey: ['transfers', 'moves-of-product', productId],
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/moves', {
          params: { query: { product_id: productId, limit: PAGE, before: pageParam } },
        }),
      ),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  })
  return { ...query, moves: query.data?.pages.flatMap((page) => page.items) }
}

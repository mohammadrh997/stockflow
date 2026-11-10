import { useQuery } from '@tanstack/react-query'

import { api, type Schemas } from '@/api/client'
import { unwrap } from '@/api/errors'
import type { Transfer } from '@/features/transfers/queries'
import { useLocations } from '@/features/warehouses/queries'
import { sumQuantities } from '@/lib/quantity'

// The API's largest page, and a stop so a long history can't keep the page busy
// (3,000 done transfers, oldest first as the API sorts them).
const PAGE = 100
const MAX_PAGES = 30

type LocationType = Schemas['LocationType']

// in: from a supplier into the warehouse. out: from the warehouse to a customer.
// count: a stock count, to or from the inventory-loss location. internal: between two
// locations of the warehouse, which changes no total.
export type MoveKind = 'in' | 'out' | 'count' | 'internal'

export type ProductMove = {
  id: number
  at: string
  quantity: string
  fromLocationId: number
  toLocationId: number
  kind: MoveKind
  // Positive when stock was added, negative when it left, empty for internal moves.
  direction: 1 | -1 | 0
  transfer: { id: number; reference: string; validatedBy: string | null }
}

export function kindOf(from: LocationType, to: LocationType): MoveKind {
  if (from === 'loss' || to === 'loss') return 'count'
  if (from === 'internal' && to === 'internal') return 'internal'
  return to === 'internal' ? 'in' : 'out'
}

type RawMove = Omit<ProductMove, 'kind' | 'direction'>

// Moves only come inside their transfers, and /transfers can't be filtered by product,
// so every done transfer is fetched and this product's moves picked out.
// Replace with a /moves endpoint once the API has one.
async function scan(productId: number): Promise<{ moves: RawMove[]; partial: boolean }> {
  const moves: RawMove[] = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const transfers: Transfer[] = await unwrap(
      api.GET('/transfers', {
        params: { query: { state: 'done', skip: page * PAGE, limit: PAGE } },
      }),
    )
    for (const transfer of transfers) {
      for (const move of transfer.moves) {
        if (move.product_id !== productId) continue
        moves.push({
          id: move.id,
          at: move.created_at,
          quantity: move.quantity,
          fromLocationId: move.from_location_id,
          toLocationId: move.to_location_id,
          transfer: {
            id: transfer.id,
            reference: transfer.reference,
            validatedBy: transfer.validated_by?.name ?? null,
          },
        })
      }
    }
    if (transfers.length < PAGE) return { moves, partial: false }
  }
  return { moves, partial: true }
}

export type ProductMoves = {
  moves: ProductMove[] // newest first
  totals: { in: string; out: string; countedUp: string; countedDown: string }
  partial: boolean
}

export function useProductMoves(productId: number) {
  const scanned = useQuery({
    // Under 'transfers', so validating or cancelling anything refreshes it.
    queryKey: ['transfers', 'moves-of-product', productId],
    queryFn: () => scan(productId),
  })
  const locations = useLocations({ include_archived: true })

  let data: ProductMoves | undefined
  if (scanned.data && locations.data) {
    const typeOf = new Map(locations.data.map((l) => [l.id, l.location_type]))
    const moves = scanned.data.moves
      .flatMap((move): ProductMove[] => {
        const from = typeOf.get(move.fromLocationId)
        const to = typeOf.get(move.toLocationId)
        if (!from || !to) return []
        const kind = kindOf(from, to)
        const direction = kind === 'internal' ? 0 : to === 'internal' ? 1 : -1
        return [{ ...move, kind, direction }]
      })
      .sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id)
    const sum = (keep: (move: ProductMove) => boolean) =>
      sumQuantities(moves.filter(keep).map((move) => move.quantity))
    data = {
      moves,
      totals: {
        in: sum((m) => m.kind === 'in'),
        out: sum((m) => m.kind === 'out'),
        countedUp: sum((m) => m.kind === 'count' && m.direction === 1),
        countedDown: sum((m) => m.kind === 'count' && m.direction === -1),
      },
      partial: scanned.data.partial,
    }
  }

  return {
    data,
    isPending: scanned.isPending || locations.isPending,
    error: scanned.error ?? locations.error,
    refetch: () => Promise.all([scanned.refetch(), locations.refetch()]),
  }
}

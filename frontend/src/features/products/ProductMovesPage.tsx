import { Link, useParams } from 'react-router'

import { DataTable, type Column } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDateTime, formatQuantity } from '@/lib/format'
import { useListParams } from '@/lib/useListParams'
import { cn } from '@/lib/utils'
import { useProduct } from './queries'
import { useProductMoves, type MoveKind, type ProductMove } from './useProductMoves'

const KINDS: { value: MoveKind | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'in', label: 'In' },
  { value: 'out', label: 'Out' },
  { value: 'count', label: 'Stock counts' },
  { value: 'internal', label: 'Internal' },
]

const KIND_LABELS: Record<MoveKind, string> = {
  in: 'In',
  out: 'Out',
  count: 'Stock count',
  internal: 'Internal',
}

const columns: Column<ProductMove>[] = [
  { header: 'Date', cell: (move) => formatDateTime(move.created_at) },
  {
    header: 'Reference',
    cell: (move) =>
      move.transfer ? (
        <Link to={`/transfers/${move.transfer.id}`} className="font-medium hover:underline">
          {move.transfer.reference}
        </Link>
      ) : (
        '—'
      ),
  },
  { header: 'Type', cell: (move) => <Badge variant="outline">{KIND_LABELS[move.kind]}</Badge> },
  { header: 'From', cell: (move) => move.from_location.name },
  { header: 'To', cell: (move) => move.to_location.name },
  {
    header: 'Quantity',
    className: 'text-right',
    // Signed and coloured by what it did to the stock; internal moves change no total.
    cell: (move) => (
      <span
        className={cn(
          'font-medium tabular-nums',
          move.direction === 1 && 'text-green-700 dark:text-green-400',
          move.direction === -1 && 'text-red-700 dark:text-red-400',
        )}
      >
        {move.direction === 1 ? '+' : move.direction === -1 ? '−' : ''}
        {formatQuantity(move.quantity)}
      </span>
    ),
  },
  { header: 'By', cell: (move) => move.created_by.name },
]

export function ProductMovesPage() {
  const id = Number(useParams().productId)
  const product = useProduct(id)
  const moves = useProductMoves(id)
  const list = useListParams()
  const requested = list.get('kind')
  const kind = KINDS.some((k) => k.value === requested) ? (requested as MoveKind) : 'all'

  // The tabs filter the moves loaded so far; "Load more" brings in older ones.
  const rows = moves.moves?.filter((move) => kind === 'all' || move.kind === kind)
  const name = product.data?.name ?? `Product #${id}`

  return (
    <div className="grid gap-6">
      <PageHeader
        pageTitle={`Moves of ${name}`}
        trail={[
          { to: '/products', label: 'Products' },
          { to: `/products/${id}`, label: name },
        ]}
        title="Moves history"
      />
      <Tabs value={kind} onValueChange={(value) => list.set('kind', value === 'all' ? '' : value)}>
        <TabsList>
          {KINDS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(move) => move.id}
        isPending={moves.isPending}
        error={moves.error}
        onRetry={() => moves.refetch()}
        emptyMessage={
          kind === 'all'
            ? 'No moves yet.'
            : moves.hasNextPage
              ? 'None of this kind among the latest moves. Load more to look further back.'
              : 'No moves of this kind.'
        }
      />
      {moves.hasNextPage && (
        <div>
          <Button
            variant="outline"
            disabled={moves.isFetchingNextPage}
            onClick={() => moves.fetchNextPage()}
          >
            {moves.isFetchingNextPage ? 'Loading…' : 'Load older moves'}
          </Button>
        </div>
      )}
    </div>
  )
}

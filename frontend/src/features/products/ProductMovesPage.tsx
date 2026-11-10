import { Link, useParams } from 'react-router'

import { DataTable, type Column } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { LocationName } from '@/components/RecordNames'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDateTime, formatQuantity } from '@/lib/format'
import { PAGE_SIZE, useListParams } from '@/lib/useListParams'
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
  { header: 'Date', cell: (move) => formatDateTime(move.at) },
  {
    header: 'Reference',
    cell: (move) => (
      <Link to={`/transfers/${move.transfer.id}`} className="font-medium hover:underline">
        {move.transfer.reference}
      </Link>
    ),
  },
  { header: 'Type', cell: (move) => <Badge variant="outline">{KIND_LABELS[move.kind]}</Badge> },
  { header: 'From', cell: (move) => <LocationName id={move.fromLocationId} /> },
  { header: 'To', cell: (move) => <LocationName id={move.toLocationId} /> },
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
  { header: 'By', cell: (move) => move.transfer.validatedBy ?? '—' },
]

export function ProductMovesPage() {
  const id = Number(useParams().productId)
  const product = useProduct(id)
  const moves = useProductMoves(id)
  const list = useListParams()
  const requested = list.get('kind')
  const kind = KINDS.some((k) => k.value === requested) ? (requested as MoveKind) : 'all'

  // The whole history is loaded at once, so filtering and paging happen here.
  const rows = (moves.data?.moves ?? []).filter((move) => kind === 'all' || move.kind === kind)
  const pageRows = rows.slice(list.skip, list.skip + PAGE_SIZE)
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
      {moves.data?.partial && (
        <p className="text-sm text-muted-foreground">
          Only the oldest 3,000 done transfers were checked, so recent moves may be missing.
        </p>
      )}
      <DataTable
        columns={columns}
        rows={moves.data ? pageRows : undefined}
        rowKey={(move) => move.id}
        isPending={moves.isPending}
        error={moves.error}
        onRetry={() => moves.refetch()}
        emptyMessage={kind === 'all' ? 'No moves yet.' : 'No moves of this kind.'}
      />
      <Pagination
        page={list.page}
        pageSize={PAGE_SIZE}
        rowCount={pageRows.length}
        hasNext={list.skip + PAGE_SIZE < rows.length}
        onPageChange={list.setPage}
      />
    </div>
  )
}

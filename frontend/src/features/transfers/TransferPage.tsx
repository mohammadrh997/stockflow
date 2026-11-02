import { useParams } from 'react-router'

import { ApiError } from '@/api/errors'
import { DataTable, type Column } from '@/components/DataTable'
import { ErrorMessage } from '@/components/ErrorMessage'
import { NotFoundPage } from '@/components/NotFoundPage'
import { PageHeader } from '@/components/PageHeader'
import { PageSpinner } from '@/components/PageSpinner'
import { Quantity } from '@/components/Quantity'
import { LocationName, ProductName, WarehouseName } from '@/components/RecordNames'
import { StateBadge } from '@/components/StateBadge'
import { formatDateTime } from '@/lib/format'
import { TRANSFER_TYPE_LABELS, useTransfer, type StockMove } from './queries'
import { TransferOrigin } from './TransferOrigin'
import { ValidateTransferDialog } from './ValidateTransferDialog'

const columns: Column<StockMove>[] = [
  {
    header: 'Product',
    cell: (move) => (
      <span className="font-medium">
        <ProductName id={move.product_id} />
      </span>
    ),
  },
  {
    header: 'Quantity',
    className: 'text-right',
    cell: (move) => <Quantity value={move.quantity} />,
  },
  { header: 'From', cell: (move) => <LocationName id={move.from_location_id} /> },
  { header: 'To', cell: (move) => <LocationName id={move.to_location_id} /> },
  { header: 'Note', cell: (move) => move.note },
]

export function TransferPage() {
  const id = Number(useParams().transferId)
  const transfer = useTransfer(id)

  if (transfer.isPending) return <PageSpinner />
  if (transfer.error instanceof ApiError && transfer.error.status === 404) return <NotFoundPage />
  if (transfer.isError) {
    return <ErrorMessage error={transfer.error} onRetry={() => transfer.refetch()} />
  }

  const { data } = transfer
  const canValidate =
    data.state === 'ready' &&
    (data.transfer_type === 'receipt' || data.transfer_type === 'delivery')

  return (
    <div className="grid gap-8">
      <PageHeader
        pageTitle={data.reference}
        back={{ to: '/transfers', label: 'Transfers' }}
        title={
          <>
            {data.reference}
            <StateBadge state={data.state} />
          </>
        }
        actions={canValidate && <ValidateTransferDialog transfer={data} />}
      />

      <dl className="grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Type</dt>
        <dd>{TRANSFER_TYPE_LABELS[data.transfer_type]}</dd>
        <dt className="text-muted-foreground">Warehouse</dt>
        <dd>
          <WarehouseName id={data.warehouse_id} />
        </dd>
        {(data.purchase_order_id !== null || data.sales_order_id !== null) && (
          <>
            <dt className="text-muted-foreground">Order</dt>
            <dd>
              <TransferOrigin transfer={data} />
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">Created</dt>
        <dd>{formatDateTime(data.created_at)}</dd>
        {data.validated_at && (
          <>
            <dt className="text-muted-foreground">Validated</dt>
            <dd>{formatDateTime(data.validated_at)}</dd>
          </>
        )}
      </dl>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Moves</h2>
        <DataTable
          columns={columns}
          rows={data.moves}
          rowKey={(move) => move.id}
          isPending={false}
          error={null}
          emptyMessage={
            data.state === 'ready'
              ? 'Stock moves are recorded when the transfer is validated.'
              : 'No stock moves.'
          }
        />
      </section>
    </div>
  )
}

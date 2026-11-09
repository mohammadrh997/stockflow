import { useLocation, useParams } from 'react-router'

import { ApiError } from '@/api/errors'
import { can } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { DataTable, type Column } from '@/components/DataTable'
import { DoneByRows } from '@/components/DoneByRows'
import { ErrorMessage } from '@/components/ErrorMessage'
import { NotFoundPage } from '@/components/NotFoundPage'
import { Panel } from '@/components/Panel'
import { PageHeader, type Crumb } from '@/components/PageHeader'
import { PageSpinner } from '@/components/PageSpinner'
import { ProgressTrack } from '@/components/ProgressTrack'
import { Quantity } from '@/components/Quantity'
import { LocationName, ProductName, WarehouseName } from '@/components/RecordNames'
import { StateBadge } from '@/components/StateBadge'
import { formatDateTime } from '@/lib/format'
import { BackorderLinks } from './BackorderLinks'
import { CancelBackorderButton } from './CancelBackorderButton'
import { TRANSFER_TYPE_LABELS, useTransfer, type StockMove } from './queries'
import { TransferLinesTable } from './TransferLinesTable'
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
  const { user } = useAuth()
  const transfer = useTransfer(id)
  // Opened from an order, the trail leads back through that order.
  const trail = (useLocation().state as { trail?: Crumb[] } | null)?.trail ?? [
    { to: '/transfers', label: 'Transfers' },
  ]

  if (transfer.isPending) return <PageSpinner />
  if (transfer.error instanceof ApiError && transfer.error.status === 404) return <NotFoundPage />
  if (transfer.isError) {
    return <ErrorMessage error={transfer.error} onRetry={() => transfer.refetch()} />
  }

  const { data } = transfer
  const fromOrder = data.transfer_type === 'receipt' || data.transfer_type === 'delivery'
  const canValidate = fromOrder && data.state === 'ready'
  const canCancelBackorder =
    canValidate && data.backorder_of_id !== null && can(user, 'inventory', 'manager')

  return (
    <div className="grid gap-8">
      <PageHeader
        pageTitle={data.reference}
        trail={trail}
        title={
          <>
            {data.reference}
            <StateBadge state={data.state} />
          </>
        }
        actions={
          <>
            {canCancelBackorder && <CancelBackorderButton transfer={data} />}
            {canValidate && <ValidateTransferDialog transfer={data} />}
          </>
        }
      />

      {fromOrder && <ProgressTrack steps={['ready', 'done']} state={data.state} />}

      <Panel>
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
              <BackorderLinks transfer={data} trail={trail} />
            </>
          )}
          <dt className="text-muted-foreground">Created</dt>
          <dd>{formatDateTime(data.created_at)}</dd>
          {data.validated_at && (
            <DoneByRows label="Validated" at={data.validated_at} by={data.validated_by} />
          )}
        </dl>
      </Panel>

      {fromOrder && (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Products</h2>
          <TransferLinesTable transfer={data} />
        </section>
      )}

      {(!fromOrder || data.moves.length > 0) && (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Moves</h2>
          <DataTable
            columns={columns}
            rows={data.moves}
            rowKey={(move) => move.id}
            isPending={false}
            error={null}
            emptyMessage="No stock moves."
          />
        </section>
      )}
    </div>
  )
}

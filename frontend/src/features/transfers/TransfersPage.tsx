import { Plus } from 'lucide-react'
import { Link } from 'react-router'

import { can } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { DataTable, type Column } from '@/components/DataTable'
import { ListToolbar } from '@/components/ListToolbar'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { WarehouseName } from '@/components/RecordNames'
import { StateBadge } from '@/components/StateBadge'
import { WarehousePicker } from '@/components/WarehousePicker'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDateTime } from '@/lib/format'
import { useListParams } from '@/lib/useListParams'
import {
  TRANSFER_TYPE_LABELS,
  useTransfers,
  type Transfer,
  type TransferState,
  type TransferType,
} from './queries'
import { TransferOrigin } from './TransferOrigin'

const TYPES = Object.keys(TRANSFER_TYPE_LABELS) as TransferType[]
const STATES: TransferState[] = ['ready', 'done', 'cancelled']
const ALL = 'all'

const columns: Column<Transfer>[] = [
  {
    header: 'Reference',
    cell: (transfer) => (
      <Link to={`/transfers/${transfer.id}`} className="font-medium hover:underline">
        {transfer.reference}
      </Link>
    ),
  },
  { header: 'Type', cell: (transfer) => TRANSFER_TYPE_LABELS[transfer.transfer_type] },
  { header: 'State', cell: (transfer) => <StateBadge state={transfer.state} /> },
  { header: 'Warehouse', cell: (transfer) => <WarehouseName id={transfer.warehouse_id} /> },
  { header: 'Order', cell: (transfer) => <TransferOrigin transfer={transfer} /> },
  { header: 'Created', cell: (transfer) => formatDateTime(transfer.created_at) },
]

export function TransfersPage() {
  const { user } = useAuth()
  const list = useListParams()
  const type = (list.get('type') || undefined) as TransferType | undefined
  const state = (list.get('state') || undefined) as TransferState | undefined
  const warehouseId = list.get('warehouse') ? Number(list.get('warehouse')) : undefined
  const transfers = useTransfers({
    transfer_type: type,
    state,
    warehouse_id: warehouseId,
    skip: list.skip,
    limit: list.limit,
  })

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Transfers"
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/transfers/internal">
                <Plus />
                Internal transfer
              </Link>
            </Button>
            {can(user, 'inventory', 'manager') && (
              <Button asChild variant="outline">
                <Link to="/transfers/adjustment">
                  <Plus />
                  Adjustment
                </Link>
              </Button>
            )}
          </>
        }
      />
      <ListToolbar>
        <Select
          value={type ?? ALL}
          onValueChange={(value) => list.set('type', value === ALL ? '' : value)}
        >
          <SelectTrigger className="w-40" aria-label="Type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {TYPES.map((value) => (
              <SelectItem key={value} value={value}>
                {TRANSFER_TYPE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={state ?? ALL}
          onValueChange={(value) => list.set('state', value === ALL ? '' : value)}
        >
          <SelectTrigger className="w-40" aria-label="State">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All states</SelectItem>
            {STATES.map((value) => (
              <SelectItem key={value} value={value} className="capitalize">
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <WarehousePicker
          value={warehouseId ?? null}
          onChange={(id) => list.set('warehouse', id === null ? '' : String(id))}
          allLabel="All warehouses"
        />
      </ListToolbar>
      <DataTable
        columns={columns}
        rows={transfers.data}
        rowKey={(transfer) => transfer.id}
        isPending={transfers.isPending}
        error={transfers.error}
        onRetry={() => transfers.refetch()}
        emptyMessage={
          type || state || warehouseId ? 'No transfers match these filters.' : 'No transfers yet.'
        }
      />
      <Pagination
        page={list.page}
        pageSize={list.limit}
        rowCount={transfers.data?.length}
        onPageChange={list.setPage}
      />
    </div>
  )
}

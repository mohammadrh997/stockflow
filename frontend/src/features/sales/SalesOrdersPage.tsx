import { Plus } from 'lucide-react'
import { Link } from 'react-router'

import { DataTable, type Column } from '@/components/DataTable'
import { ListToolbar } from '@/components/ListToolbar'
import { Money } from '@/components/Money'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { PartnerPicker } from '@/components/PartnerPicker'
import { PartnerName, WarehouseName } from '@/components/RecordNames'
import { StateBadge } from '@/components/StateBadge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useWarehouses } from '@/features/warehouses/queries'
import { formatDateTime } from '@/lib/format'
import { useListParams } from '@/lib/useListParams'
import { useSalesOrders, type SalesOrder, type SalesState } from './queries'

const STATES: SalesState[] = ['draft', 'confirmed', 'delivered', 'cancelled']
const ALL = 'all'

export function SalesOrdersPage() {
  const list = useListParams()
  const state = (list.get('state') || undefined) as SalesState | undefined
  const partnerId = list.get('partner') ? Number(list.get('partner')) : undefined
  const orders = useSalesOrders({
    state,
    partner_id: partnerId,
    skip: list.skip,
    limit: list.limit,
  })
  const warehouses = useWarehouses()
  const severalWarehouses = (warehouses.data?.length ?? 0) > 1

  const columns: Column<SalesOrder>[] = [
    {
      header: 'Reference',
      cell: (order) => (
        <Link to={`/sales-orders/${order.id}`} className="font-medium hover:underline">
          {order.reference}
        </Link>
      ),
    },
    { header: 'Customer', cell: (order) => <PartnerName id={order.partner_id} /> },
    ...(severalWarehouses
      ? [
          {
            header: 'Warehouse',
            cell: (order: SalesOrder) => <WarehouseName id={order.warehouse_id} />,
          },
        ]
      : []),
    { header: 'State', cell: (order) => <StateBadge state={order.state} /> },
    { header: 'Created', cell: (order) => formatDateTime(order.created_at) },
    { header: 'Total', className: 'text-right', cell: (order) => <Money value={order.total} /> },
  ]

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Sales orders"
        actions={
          <Button asChild>
            <Link to="/sales-orders/new">
              <Plus />
              New sales order
            </Link>
          </Button>
        }
      />
      <ListToolbar>
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
        <PartnerPicker
          role="customer"
          value={partnerId ?? null}
          onChange={(id) => list.set('partner', id === null ? '' : String(id))}
          placeholder="All customers"
          clearable
        />
      </ListToolbar>
      <DataTable
        columns={columns}
        rows={orders.data}
        rowKey={(order) => order.id}
        isPending={orders.isPending}
        error={orders.error}
        onRetry={() => orders.refetch()}
        emptyMessage={
          state || partnerId ? 'No sales orders match these filters.' : 'No sales orders yet.'
        }
      />
      <Pagination
        page={list.page}
        pageSize={list.limit}
        rowCount={orders.data?.length}
        onPageChange={list.setPage}
      />
    </div>
  )
}

import { Link } from 'react-router'

import { can } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { DataTable, type Column } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { NewWarehouseDialog } from './NewWarehouseDialog'
import { useLocations, useWarehouses, type Location, type Warehouse } from './queries'

const LOCATION_TYPE_LABELS: Record<string, string> = {
  supplier: 'Incoming goods from suppliers',
  customer: 'Outgoing goods to customers',
  loss: 'Stock adjustments and losses',
}

export function WarehousesPage() {
  const { user } = useAuth()
  const warehouses = useWarehouses()
  const allLocations = useLocations({ include_archived: true })
  const locationName = new Map(allLocations.data?.map((location) => [location.id, location.name]))
  const virtualLocations = allLocations.data?.filter((location) => location.warehouse_id === null)

  const columns: Column<Warehouse>[] = [
    {
      header: 'Name',
      cell: (warehouse) => (
        <Link to={`/warehouses/${warehouse.id}`} className="font-medium hover:underline">
          {warehouse.name}
        </Link>
      ),
    },
    { header: 'Code', cell: (warehouse) => <Badge variant="outline">{warehouse.code}</Badge> },
    {
      header: 'Default location',
      cell: (warehouse) =>
        warehouse.default_location_id === null
          ? '—'
          : (locationName.get(warehouse.default_location_id) ?? '…'),
    },
  ]

  const virtualColumns: Column<Location>[] = [
    { header: 'Name', cell: (location) => location.name },
    {
      header: 'Used for',
      cell: (location) => (
        <span className="text-muted-foreground">
          {LOCATION_TYPE_LABELS[location.location_type]}
        </span>
      ),
    },
  ]

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Warehouses"
        actions={can(user, 'inventory', 'manager') && <NewWarehouseDialog />}
      />
      <DataTable
        columns={columns}
        rows={warehouses.data}
        rowKey={(warehouse) => warehouse.id}
        rowHref={(warehouse) => `/warehouses/${warehouse.id}`}
        isPending={warehouses.isPending}
        error={warehouses.error}
        onRetry={() => warehouses.refetch()}
        emptyMessage="No warehouses yet."
      />
      <section className="grid gap-3">
        <div>
          <h2 className="text-lg font-semibold">System locations</h2>
          <p className="text-sm text-muted-foreground">
            Virtual locations that record where goods come from and go to. They can't be changed.
          </p>
        </div>
        <DataTable
          columns={virtualColumns}
          rows={virtualLocations}
          rowKey={(location) => location.id}
          isPending={allLocations.isPending}
          error={allLocations.error}
          onRetry={() => allLocations.refetch()}
          emptyMessage="No system locations."
        />
      </section>
    </div>
  )
}

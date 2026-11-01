import { Link } from 'react-router'

import { DataTable, type Column } from '@/components/DataTable'
import { ListToolbar } from '@/components/ListToolbar'
import { PageHeader } from '@/components/PageHeader'
import { ProductPicker } from '@/components/ProductPicker'
import { Quantity } from '@/components/Quantity'
import { WarehousePicker } from '@/components/WarehousePicker'
import { useWarehouses } from '@/features/warehouses/queries'
import { useListParams } from '@/lib/useListParams'
import { cn } from '@/lib/utils'
import { useStock, type StockRow } from './queries'

function idParam(value: string): number | undefined {
  return value ? Number(value) : undefined
}

export function StockPage() {
  const list = useListParams()
  const warehouseId = idParam(list.get('warehouse'))
  const productId = idParam(list.get('product'))
  const stock = useStock({ warehouse_id: warehouseId, product_id: productId })
  const warehouses = useWarehouses()
  const warehouseName = new Map(warehouses.data?.map((w) => [w.id, w.name]))

  const columns: Column<StockRow>[] = [
    {
      header: 'Product',
      cell: (row) => (
        <Link to={`/products/${row.product_id}`} className="font-medium hover:underline">
          {row.product_name}
        </Link>
      ),
    },
    { header: 'SKU', cell: (row) => row.sku },
    { header: 'Warehouse', cell: (row) => warehouseName.get(row.warehouse_id) ?? '…' },
    { header: 'On hand', className: 'text-right', cell: (row) => <Quantity value={row.on_hand} /> },
    {
      header: 'Reserved',
      className: 'text-right',
      cell: (row) => <Quantity value={row.reserved} />,
    },
    {
      header: 'Available',
      className: 'text-right',
      cell: (row) => (
        <span className={cn('font-medium', row.available.startsWith('-') && 'text-destructive')}>
          <Quantity value={row.available} />
        </span>
      ),
    },
  ]

  return (
    <div className="grid gap-6">
      <PageHeader title="Stock" />
      <p className="-mt-3 text-sm text-muted-foreground">
        Reserved is the quantity on confirmed sales orders not yet delivered. Available is on hand
        minus reserved.
      </p>
      <ListToolbar>
        <WarehousePicker
          value={warehouseId ?? null}
          onChange={(id) => list.set('warehouse', id === null ? '' : String(id))}
          allLabel="All warehouses"
        />
        <ProductPicker
          value={productId ?? null}
          onChange={(id) => list.set('product', id === null ? '' : String(id))}
          placeholder="All products"
          clearable
        />
      </ListToolbar>
      <DataTable
        columns={columns}
        rows={stock.data}
        rowKey={(row) => `${row.product_id}-${row.warehouse_id}`}
        isPending={stock.isPending}
        error={stock.error}
        onRetry={() => stock.refetch()}
        emptyMessage={
          warehouseId || productId ? 'No stock matches these filters.' : 'No stock recorded yet.'
        }
      />
    </div>
  )
}

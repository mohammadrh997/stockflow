import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { DataTable, type Column } from '@/components/DataTable'
import { Money } from '@/components/Money'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { Quantity } from '@/components/Quantity'
import { PartnerName } from '@/components/RecordNames'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BillFileDialog } from '@/features/billImports/BillFileDialog'
import { ProductForm } from '@/features/products/ProductForm'
import { formatDateTime } from '@/lib/format'
import { useListParams } from '@/lib/useListParams'
import { useCreateProductForItem, useMissingProducts, type MissingProduct } from './queries'

// The supplier we matched, or the name as printed on the bill.
function Supplier({ item }: { item: MissingProduct }) {
  const bill = item.bill_import
  return (
    <span className="grid">
      {bill.partner_id !== null ? (
        <PartnerName id={bill.partner_id} />
      ) : (
        (bill.supplier_name ?? <span className="text-muted-foreground">Not on the bill</span>)
      )}
      {bill.partner_reference && (
        <span className="text-detail text-muted-foreground">Bill {bill.partner_reference}</span>
      )}
    </span>
  )
}

function CreateProductDialog({
  item,
  onClose,
}: {
  item: MissingProduct | null
  onClose: () => void
}) {
  const create = useCreateProductForItem()
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New product</DialogTitle>
          <DialogDescription>
            Filled in from the bill. Once created, it's put on the item for purchase.
          </DialogDescription>
        </DialogHeader>
        {item !== null && (
          <ProductForm
            defaultValues={{
              name: item.description,
              sku: item.product_code ?? '',
              sale_price: '',
              // What the supplier charges is where the cost price starts.
              cost_price: Number(item.unit_price).toFixed(2),
              category_id: null,
            }}
            submitLabel="Create product"
            onSubmit={async (values) => {
              const product = await create.mutateAsync({ item, values })
              toast.success(`Created ${product.name}`)
              onClose()
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

export function MissingProductsPage() {
  const list = useListParams()
  const items = useMissingProducts({ skip: list.skip, limit: list.limit })
  const [creating, setCreating] = useState<MissingProduct | null>(null)

  const columns: Column<MissingProduct>[] = [
    {
      header: 'Item on the bill',
      cell: (item) => (
        <span className="grid">
          <span className="font-medium">{item.description}</span>
          {item.product_code && (
            <span className="text-detail text-muted-foreground">Code {item.product_code}</span>
          )}
        </span>
      ),
    },
    { header: 'Supplier', cell: (item) => <Supplier item={item} /> },
    {
      header: 'Quantity',
      className: 'text-right',
      cell: (item) => <Quantity value={item.quantity} />,
    },
    {
      header: 'Unit price',
      className: 'text-right',
      cell: (item) => <Money value={item.unit_price} />,
    },
    {
      header: 'Asked',
      cell: (item) => (
        <span className="grid">
          {formatDateTime(item.bill_import.products_requested_at)}
          <span className="text-detail text-muted-foreground">
            by {item.bill_import.products_requested_by.name}
          </span>
        </span>
      ),
    },
    {
      header: 'Actions',
      cell: (item) => (
        <span className="flex flex-wrap justify-end gap-2">
          {item.bill_import.file_type !== null && (
            <BillFileDialog
              source={{ kind: 'item', lineId: item.id }}
              fileType={item.bill_import.file_type}
              description={`The bill with "${item.description}" on it.`}
            />
          )}
          <Button size="sm" onClick={() => setCreating(item)}>
            <Plus />
            Create product
          </Button>
        </span>
      ),
      className: 'text-right',
    },
  ]

  return (
    <div className="grid gap-6">
      <PageHeader title="Products to create" />
      <p className="-mt-3 max-w-2xl text-sm text-muted-foreground">
        Items on supplier bills that purchase can't match to a product. Create each one here and it
        goes straight onto the bill, oldest request first.
      </p>
      <DataTable
        columns={columns}
        rows={items.data?.data}
        rowKey={(item) => item.id}
        isPending={items.isPending}
        error={items.error}
        onRetry={() => items.refetch()}
        emptyMessage="Nothing to create: no bill is waiting on a product."
      />
      <Pagination
        page={list.page}
        pageSize={list.limit}
        rowCount={items.data?.data.length}
        onPageChange={list.setPage}
      />
      <CreateProductDialog item={creating} onClose={() => setCreating(null)} />
    </div>
  )
}

import { useState } from 'react'

import { DataTable, type Column } from '@/components/DataTable'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Money } from '@/components/Money'
import { Quantity } from '@/components/Quantity'
import { ProductName } from '@/components/RecordNames'
import { RemoveLineButton } from '@/features/orders/RemoveLineButton'
import { LineField } from '@/features/orders/LineField'
import { checkQuantity, checkUnitPrice } from '@/features/orders/lineRules'
import { formatQuantity } from '@/lib/format'
import { useInvoiceLines, type Invoice, type InvoiceLine } from './queries'

// On a draft, quantity (up to what moved and isn't invoiced yet; the server checks) and price
// are edited in place and lines can be removed.
export function InvoiceLinesTable({ invoice, editable }: { invoice: Invoice; editable: boolean }) {
  const lines = useInvoiceLines(invoice.id)
  const [removeError, setRemoveError] = useState<unknown>(null)

  async function remove(lineId: number) {
    setRemoveError(null)
    try {
      await lines.remove.mutateAsync(lineId)
    } catch (error) {
      setRemoveError(error)
    }
  }

  const columns: Column<InvoiceLine>[] = [
    {
      header: 'Product',
      cell: (line) => (
        <span className="font-medium">
          <ProductName id={line.product_id} thumb />
        </span>
      ),
    },
    {
      header: 'Quantity',
      className: 'text-right',
      cell: (line) =>
        editable ? (
          <LineField
            key={line.quantity}
            productId={line.product_id}
            field="Quantity"
            value={line.quantity}
            format={formatQuantity}
            validate={checkQuantity}
            onSave={(quantity) =>
              lines.update.mutateAsync({ lineId: line.id, changes: { quantity } })
            }
          />
        ) : (
          <Quantity value={line.quantity} />
        ),
    },
    {
      header: 'Unit price',
      className: 'text-right',
      cell: (line) =>
        editable ? (
          <LineField
            key={line.unit_price}
            productId={line.product_id}
            field="Unit price"
            value={line.unit_price}
            format={(value) => value}
            validate={checkUnitPrice}
            onSave={(unit_price) =>
              lines.update.mutateAsync({ lineId: line.id, changes: { unit_price } })
            }
          />
        ) : (
          <Money value={line.unit_price} />
        ),
    },
    {
      header: 'Subtotal',
      className: 'text-right',
      cell: (line) => (line.subtotal ? <Money value={line.subtotal} /> : '—'),
    },
  ]
  if (editable) {
    columns.push({
      header: 'Actions',
      className: 'text-right',
      cell: (line) => (
        <RemoveLineButton
          productId={line.product_id}
          disabled={lines.remove.isPending}
          onClick={() => remove(line.id)}
        />
      ),
    })
  }

  return (
    <div className="grid min-w-0 gap-3">
      {removeError !== null && <ErrorMessage error={removeError} />}
      <DataTable
        columns={columns}
        rows={invoice.lines}
        rowKey={(line) => line.id}
        isPending={false}
        error={null}
        emptyMessage="No lines. A draft needs at least one line to be posted."
      />
    </div>
  )
}

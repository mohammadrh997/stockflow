import { useState } from 'react'
import { toast } from 'sonner'

import { errorMessage } from '@/api/errors'
import { can } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { DataTable, type Column } from '@/components/DataTable'
import { Money } from '@/components/Money'
import { ProductPicker } from '@/components/ProductPicker'
import { Quantity } from '@/components/Quantity'
import { ProductName } from '@/components/RecordNames'
import { Button } from '@/components/ui/button'
import { LineField } from '@/features/orders/LineField'
import { checkQuantity, checkUnitPrice } from '@/features/orders/lineRules'
import { QuickCreateProductDialog } from '@/features/products/QuickCreateProductDialog'
import { formatMoney, formatQuantity } from '@/lib/format'
import { useImportLines, type BillImport, type BillImportLine } from './queries'

// How the product was found, so a guess is never mistaken for a certainty.
function MatchHint({ line }: { line: BillImportLine }) {
  if (line.product_id === null) {
    return <span className="text-amber-700 dark:text-amber-400">No match: choose a product</span>
  }
  if (line.match_score === null) return null // chosen by a person
  if (Number(line.match_score) >= 1) return <span>Matched by its code</span>
  return <span>Similar name ({Math.round(Number(line.match_score) * 100)}% alike): check it</span>
}

type Props = { bill: BillImport; editable: boolean }

// The bill's items as printed, next to the product each will be ordered as.
export function ImportLinesTable({ bill, editable }: Props) {
  const { user } = useAuth()
  const lines = useImportLines(bill.id)
  const canCreateProduct = can(user, 'inventory', 'manager')
  // The line a product is being created for, and the name to start from.
  const [creating, setCreating] = useState<{ line: BillImportLine; name: string } | null>(null)

  async function change(lineId: number, changes: Parameters<typeof lines.update.mutateAsync>[0]) {
    try {
      await lines.update.mutateAsync({ ...changes, lineId })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const columns: Column<BillImportLine>[] = [
    {
      header: 'On the bill',
      cell: (line) => (
        <span className="grid">
          <span>{line.description}</span>
          {line.product_code && (
            <span className="text-xs text-muted-foreground">Code {line.product_code}</span>
          )}
        </span>
      ),
    },
    {
      header: 'Product',
      cell: (line) =>
        editable ? (
          <div className="grid min-w-56 gap-1">
            <ProductPicker
              value={line.product_id}
              onChange={(productId) =>
                void change(line.id, { lineId: line.id, product_id: productId })
              }
              placeholder="Choose a product"
              aria-label={`Product for ${line.description}`}
              onCreate={canCreateProduct ? (name) => setCreating({ line, name }) : undefined}
              emptyHint={canCreateProduct ? undefined : 'Ask an inventory manager to add it.'}
            />
            <span className="text-xs text-muted-foreground">
              <MatchHint line={line} />
            </span>
          </div>
        ) : line.product_id !== null ? (
          <ProductName id={line.product_id} />
        ) : (
          '—'
        ),
    },
    {
      header: 'Quantity',
      className: 'text-right',
      cell: (line) =>
        editable ? (
          <LineField
            key={line.quantity}
            name={line.description}
            field="Quantity"
            value={line.quantity}
            format={formatQuantity}
            validate={checkQuantity}
            onSave={(quantity) => lines.update.mutateAsync({ lineId: line.id, quantity })}
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
            name={line.description}
            field="Unit price"
            value={line.unit_price}
            format={formatMoney}
            validate={checkUnitPrice}
            onSave={(unit_price) => lines.update.mutateAsync({ lineId: line.id, unit_price })}
          />
        ) : (
          <Money value={line.unit_price} />
        ),
    },
    {
      header: 'Amount',
      className: 'text-right',
      cell: (line) => <Money value={line.subtotal} />,
    },
    ...(editable
      ? [
          {
            header: 'Remove',
            className: 'w-0',
            cell: (line: BillImportLine) => (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${line.description}`}
                disabled={lines.remove.isPending}
                onClick={async () => {
                  try {
                    await lines.remove.mutateAsync(line.id)
                  } catch (error) {
                    toast.error(errorMessage(error))
                  }
                }}
              >
                Remove
              </Button>
            ),
          },
        ]
      : []),
  ]

  return (
    <>
      <DataTable
        columns={columns}
        rows={bill.lines}
        rowKey={(line) => line.id}
        isPending={false}
        error={null}
        emptyMessage="No items left on this bill."
      />
      {/* Outside the table, so the dialog's form stands on its own. */}
      <QuickCreateProductDialog
        name={creating?.name ?? null}
        emphasise="cost_price"
        prefill={{
          sku: creating?.line.product_code ?? undefined,
          cost_price: creating?.line.unit_price,
        }}
        description="It is chosen for this item of the bill once created."
        onClose={() => setCreating(null)}
        onCreated={(product) => {
          const line = creating?.line
          setCreating(null)
          if (line) void change(line.id, { lineId: line.id, product_id: product.id })
        }}
      />
    </>
  )
}

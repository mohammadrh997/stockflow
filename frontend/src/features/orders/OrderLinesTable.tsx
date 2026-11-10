import { useState } from 'react'

import { DataTable, type Column } from '@/components/DataTable'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Money } from '@/components/Money'
import { Quantity } from '@/components/Quantity'
import { ProductName } from '@/components/RecordNames'
import { RemoveLineButton } from './RemoveLineButton'
import { formatQuantity } from '@/lib/format'
import { LineField } from './LineField'
import { checkQuantity, checkUnitPrice } from './lineRules'
import type { LineChanges, LineHint, OrderLine } from './types'

type Props = {
  lines: OrderLine[]
  total: string
  editable: boolean
  hint?: LineHint
  // Once confirmed: how much of each line was received or delivered, e.g. "4 of 10".
  // Columns such as "Received 4 of 10": a header and, per line, how much is done.
  progress?: { header: string; done: (lineId: number) => string }[]
  onUpdate: (lineId: number, changes: LineChanges) => Promise<unknown>
  onDelete: (lineId: number) => Promise<unknown>
}

export function OrderLinesTable({
  lines,
  total,
  editable,
  hint,
  progress,
  onUpdate,
  onDelete,
}: Props) {
  const [deleteError, setDeleteError] = useState<unknown>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  async function handleDelete(lineId: number) {
    setDeleteError(null)
    setDeletingId(lineId)
    try {
      await onDelete(lineId)
    } catch (error) {
      setDeleteError(error)
    } finally {
      setDeletingId(null)
    }
  }

  const columns: Column<OrderLine>[] = [
    {
      header: 'Product',
      cell: (line) => (
        <div className="grid gap-0.5">
          <span className="font-medium">
            <ProductName id={line.product_id} thumb />
          </span>
          {hint && <span className="text-xs text-muted-foreground">{hint(line.product_id)}</span>}
        </div>
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
            onSave={(quantity) => onUpdate(line.id, { quantity })}
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
            onSave={(unit_price) => onUpdate(line.id, { unit_price })}
          />
        ) : (
          <Money value={line.unit_price} />
        ),
    },
    {
      header: 'Subtotal',
      className: 'text-right',
      cell: (line) => <Money value={line.subtotal} />,
    },
  ]
  for (const [index, column] of (progress ?? []).entries()) {
    columns.splice(2 + index, 0, {
      header: column.header,
      className: 'text-right',
      cell: (line) => (
        <span className="tabular-nums">
          {formatQuantity(column.done(line.id))}
          <span className="text-muted-foreground"> of {formatQuantity(line.quantity)}</span>
        </span>
      ),
    })
  }
  if (editable) {
    columns.push({
      header: 'Actions',
      className: 'text-right',
      cell: (line) => (
        <div className="flex justify-end gap-1">
          <RemoveLineButton
            productId={line.product_id}
            disabled={deletingId === line.id}
            onClick={() => handleDelete(line.id)}
          />
        </div>
      ),
    })
  }

  return (
    <div className="grid min-w-0 gap-3">
      {deleteError !== null && <ErrorMessage error={deleteError} />}
      <DataTable
        columns={columns}
        rows={lines}
        rowKey={(line) => line.id}
        isPending={false}
        error={null}
        emptyMessage="No lines yet."
      />
      <div className="flex justify-end gap-6 px-2 text-lg">
        <span className="text-muted-foreground">Total</span>
        <span className="font-semibold">
          <Money value={total} />
        </span>
      </div>
    </div>
  )
}

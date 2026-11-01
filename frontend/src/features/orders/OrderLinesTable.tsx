import { useState } from 'react'

import { DataTable, type Column } from '@/components/DataTable'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Money } from '@/components/Money'
import { Quantity } from '@/components/Quantity'
import { ProductName } from '@/components/RecordNames'
import { Button } from '@/components/ui/button'
import { EditLineDialog } from './EditLineDialog'
import type { LineChanges, LineHint, OrderLine } from './types'

type Props = {
  lines: OrderLine[]
  total: string
  editable: boolean
  hint?: LineHint
  onUpdate: (lineId: number, changes: LineChanges) => Promise<unknown>
  onDelete: (lineId: number) => Promise<unknown>
}

export function OrderLinesTable({ lines, total, editable, hint, onUpdate, onDelete }: Props) {
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
            <ProductName id={line.product_id} />
          </span>
          {hint && <span className="text-xs text-muted-foreground">{hint(line.product_id)}</span>}
        </div>
      ),
    },
    {
      header: 'Quantity',
      className: 'text-right',
      cell: (line) => <Quantity value={line.quantity} />,
    },
    {
      header: 'Unit price',
      className: 'text-right',
      cell: (line) => <Money value={line.unit_price} />,
    },
    {
      header: 'Subtotal',
      className: 'text-right',
      cell: (line) => <Money value={line.subtotal} />,
    },
  ]
  if (editable) {
    columns.push({
      header: 'Actions',
      className: 'text-right',
      cell: (line) => (
        <div className="flex justify-end gap-1">
          <EditLineDialog line={line} onSave={(changes) => onUpdate(line.id, changes)} />
          <Button
            variant="ghost"
            size="sm"
            disabled={deletingId === line.id}
            onClick={() => handleDelete(line.id)}
          >
            Remove
          </Button>
        </div>
      ),
    })
  }

  return (
    <div className="grid gap-3">
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

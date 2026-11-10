import { DataTable, type Column } from '@/components/DataTable'
import { Quantity } from '@/components/Quantity'
import { ProductName } from '@/components/RecordNames'
import type { Transfer, TransferLine } from './queries'

const QUANTITY_HEADER = {
  ready: 'To move',
  done: 'Moved',
  cancelled: 'Not moved',
}

// What a receipt or delivery is about. Once done, its lines list only what actually moved.
export function TransferLinesTable({ transfer }: { transfer: Transfer }) {
  const columns: Column<TransferLine>[] = [
    {
      header: 'Product',
      cell: (line) => (
        <span className="font-medium">
          <ProductName id={line.product_id} thumb />
        </span>
      ),
    },
    {
      header: QUANTITY_HEADER[transfer.state],
      className: 'text-right',
      cell: (line) => <Quantity value={line.quantity} />,
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={transfer.lines}
      rowKey={(line) => line.id}
      isPending={false}
      error={null}
      emptyMessage="No lines."
    />
  )
}

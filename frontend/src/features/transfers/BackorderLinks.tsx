import { Link } from 'react-router'

import type { Crumb } from '@/components/PageHeader'
import { useTransfer, useTransfers, type Transfer } from './queries'

const ORDER_TRANSFERS_LIMIT = 100

type Props = { transfer: Transfer; trail: Crumb[] }

// "Backorder of" points back; "Backorder" points forward. The API only stores the link back,
// so the forward one is found among the order's transfers.
export function BackorderLinks({ transfer, trail }: Props) {
  const parent = useTransfer(transfer.backorder_of_id ?? 0, {
    enabled: transfer.backorder_of_id !== null,
  })
  const siblings = useTransfers(
    {
      purchase_order_id: transfer.purchase_order_id ?? undefined,
      sales_order_id: transfer.sales_order_id ?? undefined,
      limit: ORDER_TRANSFERS_LIMIT,
    },
    { enabled: transfer.purchase_order_id !== null || transfer.sales_order_id !== null },
  )
  const child = siblings.data?.find((t) => t.backorder_of_id === transfer.id)

  return (
    <>
      {transfer.backorder_of_id !== null && (
        <>
          <dt className="text-muted-foreground">Backorder of</dt>
          <dd>
            <Link
              to={`/transfers/${transfer.backorder_of_id}`}
              state={{ trail }}
              className="hover:underline"
            >
              {parent.data?.reference ?? `Transfer #${transfer.backorder_of_id}`}
            </Link>
          </dd>
        </>
      )}
      {child && (
        <>
          <dt className="text-muted-foreground">Backorder</dt>
          <dd>
            <Link to={`/transfers/${child.id}`} state={{ trail }} className="hover:underline">
              {child.reference}
            </Link>
            <span className="text-muted-foreground"> · what didn't move</span>
          </dd>
        </>
      )}
    </>
  )
}

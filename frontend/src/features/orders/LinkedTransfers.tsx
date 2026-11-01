import { Link } from 'react-router'

import { ErrorMessage } from '@/components/ErrorMessage'
import { StateBadge } from '@/components/StateBadge'
import { useTransfers, type TransferListParams } from '@/features/transfers/queries'

type Props = {
  title: string
  filter: Pick<TransferListParams, 'purchase_order_id' | 'sales_order_id'>
}

// The receipt or delivery created when the order was confirmed.
export function LinkedTransfers({ title, filter }: Props) {
  const transfers = useTransfers(filter)

  return (
    <section className="grid gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {transfers.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {transfers.isError && (
        <ErrorMessage error={transfers.error} onRetry={() => transfers.refetch()} />
      )}
      {transfers.data?.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
      <ul className="grid gap-2">
        {transfers.data?.map((transfer) => (
          <li key={transfer.id} className="flex items-center gap-3">
            <Link to={`/transfers/${transfer.id}`} className="font-medium hover:underline">
              {transfer.reference}
            </Link>
            <StateBadge state={transfer.state} />
          </li>
        ))}
      </ul>
    </section>
  )
}

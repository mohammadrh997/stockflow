import { PackageCheck, Send } from 'lucide-react'
import { Link } from 'react-router'

import type { Crumb } from '@/components/PageHeader'
import { StateBadge } from '@/components/StateBadge'
import { Button } from '@/components/ui/button'
import { useTransfers, type TransferListParams } from '@/features/transfers/queries'

type Props = {
  kind: 'receipt' | 'delivery'
  filter: Pick<TransferListParams, 'purchase_order_id' | 'sales_order_id'>
  // The order's own breadcrumb trail, continued on the transfer page.
  trail: Crumb[]
}

// The receipt or delivery created when the order was confirmed, one click away in the header.
export function LinkedTransferButtons({ kind, filter, trail }: Props) {
  const transfers = useTransfers(filter)
  const Icon = kind === 'receipt' ? PackageCheck : Send
  const label = kind === 'receipt' ? 'Receipt' : 'Delivery'

  return transfers.data?.map((transfer) => (
    <Button key={transfer.id} asChild variant="outline">
      <Link to={`/transfers/${transfer.id}`} state={{ trail }}>
        <Icon />
        {label}
        <span className="text-muted-foreground">{transfer.reference}</span>
        <StateBadge state={transfer.state} />
      </Link>
    </Button>
  ))
}

import { ChevronDown, PackageCheck, Send } from 'lucide-react'
import { Link } from 'react-router'

import type { Crumb } from '@/components/PageHeader'
import { StateBadge } from '@/components/StateBadge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Transfer } from '@/features/transfers/queries'

type Props = {
  kind: 'receipt' | 'delivery'
  transfers: Transfer[]
  // The order's own breadcrumb trail, continued on the transfer page.
  trail: Crumb[]
}

const LABELS = {
  receipt: { one: 'Receipt', many: 'Receipts', icon: PackageCheck },
  delivery: { one: 'Delivery', many: 'Deliveries', icon: Send },
}

// One transfer opens directly; several open a short history, oldest first.
export function OrderTransfersButton({ kind, transfers, trail }: Props) {
  const { one, many, icon: Icon } = LABELS[kind]
  const reference = new Map(transfers.map((t) => [t.id, t.reference]))

  if (transfers.length === 0) return null

  if (transfers.length === 1) {
    const [transfer] = transfers
    return (
      <Button asChild variant="outline">
        <Link
          to={`/transfers/${transfer.id}`}
          state={{ trail }}
          aria-label={`${one} ${transfer.reference}, ${transfer.state}`}
        >
          <Icon />
          {one}
          <span className="text-muted-foreground">{transfer.reference}</span>
          <StateBadge state={transfer.state} />
        </Link>
      </Button>
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Icon />
          {many} ({transfers.length})
          <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <ul aria-label={many} className="grid gap-1">
          {transfers.map((transfer) => (
            <li key={transfer.id}>
              <Link
                to={`/transfers/${transfer.id}`}
                state={{ trail }}
                className="grid gap-0.5 rounded-md px-2 py-1.5 hover:bg-muted"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{transfer.reference}</span>
                  <StateBadge state={transfer.state} />
                </span>
                {transfer.backorder_of_id !== null && (
                  <span className="text-xs text-muted-foreground">
                    Backorder of {reference.get(transfer.backorder_of_id)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

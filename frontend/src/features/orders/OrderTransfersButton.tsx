import { PackageCheck, Send } from 'lucide-react'
import { Link } from 'react-router'

import type { Crumb } from '@/components/PageHeader'
import { SMART_BUTTON, SmartButtonFace } from '@/components/SmartButton'
import { StateBadge } from '@/components/StateBadge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Transfer } from '@/features/transfers/queries'

type Props = {
  kind: 'receipt' | 'delivery'
  transfers: Transfer[]
  // The order's own breadcrumb trail, continued on the transfer page.
  trail: Crumb[]
}

const LABELS = {
  receipt: { one: 'receipt', many: 'receipts', icon: PackageCheck, verb: 'received' },
  delivery: { one: 'delivery', many: 'deliveries', icon: Send, verb: 'delivered' },
}

// A smart button for an order's receipts or deliveries: one opens directly, several open a
// short history, oldest first.
export function OrderTransfersButton({ kind, transfers, trail }: Props) {
  const { one, many, icon, verb } = LABELS[kind]
  const reference = new Map(transfers.map((t) => [t.id, t.reference]))

  if (transfers.length === 0) return null

  const waiting = transfers.filter((t) => t.state === 'ready').length
  const face = (
    <SmartButtonFace
      icon={icon}
      value={transfers.length}
      label={transfers.length === 1 ? one : many}
      detail={waiting > 0 ? `${waiting} waiting` : `All ${verb}`}
    />
  )

  if (transfers.length === 1) {
    return (
      <Link to={`/transfers/${transfers[0].id}`} state={{ trail }} className={SMART_BUTTON}>
        {face}
      </Link>
    )
  }

  return (
    <Popover>
      <PopoverTrigger className={SMART_BUTTON}>{face}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <ul aria-label={many.charAt(0).toUpperCase() + many.slice(1)} className="grid gap-1">
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

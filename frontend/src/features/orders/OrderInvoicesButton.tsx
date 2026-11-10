import { FileText, ReceiptText } from 'lucide-react'
import { Link } from 'react-router'

import type { Crumb } from '@/components/PageHeader'
import { SMART_BUTTON, SmartButtonFace } from '@/components/SmartButton'
import { StateBadge } from '@/components/StateBadge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PaymentBadge } from '@/features/invoices/InvoiceBits'
import { invoiceTitle } from '@/features/invoices/invoiceInfo'
import type { Invoice } from '@/features/invoices/queries'
import { formatMoney } from '@/lib/format'
import { fromThousandths, toThousandths } from '@/lib/quantity'

type Props = {
  kind: 'invoice' | 'bill'
  invoices: Invoice[]
  // The order's own breadcrumb trail, continued on the invoice page.
  trail: Crumb[]
}

const LABELS = {
  invoice: { one: 'invoice', many: 'invoices', icon: ReceiptText },
  bill: { one: 'bill', many: 'bills', icon: FileText },
}

// A smart button for an order's invoices or bills, like its receipts and deliveries: none
// says so, one opens directly, several open a short history.
export function OrderInvoicesButton({ kind, invoices, trail }: Props) {
  const { one, many, icon } = LABELS[kind]
  const posted = invoices.filter((invoice) => invoice.state === 'posted')
  const postedTotal = fromThousandths(
    posted.reduce((sum, invoice) => sum + toThousandths(invoice.amount_total ?? '0'), 0n),
  )
  const face = (
    <SmartButtonFace
      icon={icon}
      value={invoices.length}
      label={invoices.length === 1 ? one : many}
      detail={posted.length > 0 ? `${formatMoney(postedTotal)} posted` : 'None posted yet'}
    />
  )

  if (invoices.length === 0) {
    return <div className={`${SMART_BUTTON} hover:bg-card`}>{face}</div>
  }

  if (invoices.length === 1) {
    return (
      <Link to={`/invoices/${invoices[0].id}`} state={{ trail }} className={SMART_BUTTON}>
        {face}
      </Link>
    )
  }

  return (
    <Popover>
      <PopoverTrigger className={SMART_BUTTON}>{face}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <ul aria-label={many.charAt(0).toUpperCase() + many.slice(1)} className="grid gap-1">
          {invoices.map((invoice) => (
            <li key={invoice.id}>
              <Link
                to={`/invoices/${invoice.id}`}
                state={{ trail }}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
              >
                <span className="font-medium">{invoiceTitle(invoice)}</span>
                <span className="flex items-center gap-1">
                  <PaymentBadge invoice={invoice} />
                  <StateBadge state={invoice.state} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

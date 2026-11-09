import { ChevronDown, ReceiptText } from 'lucide-react'
import { Link } from 'react-router'

import type { Crumb } from '@/components/PageHeader'
import { StateBadge } from '@/components/StateBadge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PaymentBadge } from '@/features/invoices/InvoiceBits'
import { invoiceTitle } from '@/features/invoices/invoiceInfo'
import type { Invoice } from '@/features/invoices/queries'

type Props = {
  kind: 'invoice' | 'bill'
  invoices: Invoice[]
  // The order's own breadcrumb trail, continued on the invoice page.
  trail: Crumb[]
}

const LABELS = {
  invoice: { one: 'Invoice', many: 'Invoices' },
  bill: { one: 'Bill', many: 'Bills' },
}

// Like the receipts and deliveries: one invoice opens directly, several open a short history.
export function OrderInvoicesButton({ kind, invoices, trail }: Props) {
  const { one, many } = LABELS[kind]

  if (invoices.length === 0) return null

  if (invoices.length === 1) {
    const [invoice] = invoices
    return (
      <Button asChild variant="outline">
        <Link
          to={`/invoices/${invoice.id}`}
          state={{ trail }}
          aria-label={`${one} ${invoiceTitle(invoice)}, ${invoice.state}`}
        >
          <ReceiptText />
          {one}
          <span className="text-muted-foreground">{invoiceTitle(invoice)}</span>
          <StateBadge state={invoice.state} />
        </Link>
      </Button>
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <ReceiptText />
          {many} ({invoices.length})
          <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <ul aria-label={many} className="grid gap-1">
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

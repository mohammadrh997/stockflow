import { Link } from 'react-router'

import { canOnInvoices } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Money } from '@/components/Money'
import { Panel } from '@/components/Panel'
import { Skeleton } from '@/components/ui/skeleton'
import { OverdueBadge } from '@/features/invoices/InvoiceBits'
import { invoiceTitle } from '@/features/invoices/invoiceInfo'
import { useInvoices, type InvoiceType } from '@/features/invoices/queries'
import { formatDate, today } from '@/lib/dates'
import { fromThousandths, toThousandths } from '@/lib/quantity'

// The API's largest page. The list has no "unpaid" filter, so open invoices are picked from it.
const LIMIT = 100

const COPY = {
  customer_invoice: { title: 'Invoices', owed: 'Owes you', all: 'All invoices' },
  vendor_bill: { title: 'Bills', owed: 'You owe', all: 'All bills' },
}

function OpenInvoices({ partnerId, type }: { partnerId: number; type: InvoiceType }) {
  const posted = useInvoices({
    invoice_type: type,
    partner_id: partnerId,
    state: 'posted',
    limit: LIMIT,
  })
  const copy = COPY[type]
  const now = today()

  let body
  if (posted.isPending) {
    body = <Skeleton className="h-16 w-full" />
  } else if (posted.isError) {
    body = <ErrorMessage error={posted.error} onRetry={() => posted.refetch()} />
  } else {
    const open = posted.data.filter((invoice) => toThousandths(invoice.amount_due) > 0n)
    const owed = fromThousandths(
      open.reduce((sum, invoice) => sum + toThousandths(invoice.amount_due), 0n),
    )
    const partial = posted.data.length >= LIMIT
    body = (
      <>
        <p className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {copy.owed}
            {partial && ' (at least)'}
          </span>
          <span className="text-lg font-semibold">
            <Money value={owed} />
          </span>
        </p>
        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing open.</p>
        ) : (
          <ul aria-label={`Open ${copy.title.toLowerCase()}`} className="grid gap-1 text-sm">
            {open.map((invoice) => (
              <li key={invoice.id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Link to={`/invoices/${invoice.id}`} className="font-medium hover:underline">
                    {invoiceTitle(invoice)}
                  </Link>
                  {invoice.due_date && (
                    <span className="text-muted-foreground">
                      due {formatDate(invoice.due_date)}
                    </span>
                  )}
                  <OverdueBadge invoice={invoice} today={now} />
                </span>
                <Money value={invoice.amount_due} />
              </li>
            ))}
          </ul>
        )}
      </>
    )
  }

  return (
    <Panel>
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">{copy.title}</h2>
          <Link
            to={`/invoices?type=${type}&partner=${partnerId}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            {copy.all}
          </Link>
        </div>
        {body}
      </div>
    </Panel>
  )
}

type Props = { partner: { id: number; is_customer: boolean; is_supplier: boolean } }

// What the partner still owes, or is owed, for the roles the user can see invoices for.
export function PartnerInvoices({ partner }: Props) {
  const { user } = useAuth()
  const types: InvoiceType[] = []
  if (partner.is_customer && canOnInvoices(user, 'customer_invoice')) {
    types.push('customer_invoice')
  }
  if (partner.is_supplier && canOnInvoices(user, 'vendor_bill')) types.push('vendor_bill')
  if (types.length === 0) return null

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {types.map((type) => (
        <OpenInvoices key={type} partnerId={partner.id} type={type} />
      ))}
    </div>
  )
}

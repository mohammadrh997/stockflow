import { Link } from 'react-router'

import { useAuth } from '@/auth/useAuth'
import { defaultInvoiceType } from '@/components/layout/navigation'
import { DataTable, type Column } from '@/components/DataTable'
import { ListToolbar } from '@/components/ListToolbar'
import { Money } from '@/components/Money'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { PartnerPicker } from '@/components/PartnerPicker'
import { PartnerName } from '@/components/RecordNames'
import { StateBadge } from '@/components/StateBadge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDate, today } from '@/lib/dates'
import { moneyHeading, useCurrency } from '@/features/company/queries'
import { useListParams } from '@/lib/useListParams'
import { InvoiceOrderLink, OverdueBadge, PaymentBadge } from './InvoiceBits'
import { invoiceTitle } from './invoiceInfo'
import {
  INVOICE_TYPE_LABELS,
  useInvoices,
  type Invoice,
  type InvoiceState,
  type InvoiceType,
} from './queries'

const STATES: InvoiceState[] = ['draft', 'posted', 'cancelled']
const ALL = 'all'

export function InvoicesPage() {
  const { user } = useAuth()
  const list = useListParams()
  // Everyone here can read both kinds, picked in the top bar; it opens on the kind they work on.
  const requested = list.get('type')
  const type: InvoiceType =
    requested === 'customer_invoice' || requested === 'vendor_bill'
      ? requested
      : defaultInvoiceType(user)
  const state = (list.get('state') || undefined) as InvoiceState | undefined
  const partnerId = list.get('partner') ? Number(list.get('partner')) : undefined
  const invoices = useInvoices({
    invoice_type: type,
    state,
    partner_id: partnerId,
    skip: list.skip,
    limit: list.limit,
  })
  const now = today()
  const currency = useCurrency()
  const customer = type === 'customer_invoice'

  const columns: Column<Invoice>[] = [
    {
      header: 'Number',
      cell: (invoice) => (
        <Link to={`/invoices/${invoice.id}`} className="font-medium hover:underline">
          {invoiceTitle(invoice)}
        </Link>
      ),
    },
    {
      header: customer ? 'Customer' : 'Supplier',
      cell: (invoice) => <PartnerName id={invoice.partner_id} />,
    },
    { header: 'Order', cell: (invoice) => <InvoiceOrderLink invoice={invoice} /> },
    {
      header: 'Due',
      cell: (invoice) => (
        <span className="flex items-center gap-2">
          {invoice.due_date ? formatDate(invoice.due_date) : '—'}
          <OverdueBadge invoice={invoice} today={now} />
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (invoice) => (
        <span className="flex gap-1">
          <StateBadge state={invoice.state} />
          <PaymentBadge invoice={invoice} />
        </span>
      ),
    },
    {
      header: moneyHeading('Total', currency),
      className: 'text-right',
      cell: (invoice) => (invoice.amount_total ? <Money value={invoice.amount_total} /> : '—'),
    },
    {
      header: moneyHeading('Amount due', currency),
      className: 'text-right',
      cell: (invoice) => (invoice.state === 'posted' ? <Money value={invoice.amount_due} /> : '—'),
    },
  ]

  return (
    <div className="grid gap-6">
      <PageHeader title={INVOICE_TYPE_LABELS[type].many} />
      <p className="-mt-3 text-sm text-muted-foreground">
        {customer ? 'Invoices' : 'Bills'} are created from an order once its goods have been
        {customer ? ' delivered' : ' received'}.
      </p>
      <ListToolbar>
        <Select
          value={state ?? ALL}
          onValueChange={(value) => list.set('state', value === ALL ? '' : value)}
        >
          <SelectTrigger className="w-40" aria-label="State">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All states</SelectItem>
            {STATES.map((value) => (
              <SelectItem key={value} value={value} className="capitalize">
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <PartnerPicker
          key={type}
          role={customer ? 'customer' : 'supplier'}
          value={partnerId ?? null}
          onChange={(id) => list.set('partner', id === null ? '' : String(id))}
          placeholder={customer ? 'All customers' : 'All suppliers'}
          clearable
        />
      </ListToolbar>
      <DataTable
        columns={columns}
        rows={invoices.data}
        rowKey={(invoice) => invoice.id}
        rowHref={(invoice) => `/invoices/${invoice.id}`}
        isPending={invoices.isPending}
        error={invoices.error}
        onRetry={() => invoices.refetch()}
        emptyMessage={
          state || partnerId
            ? 'No invoices match these filters.'
            : `No ${INVOICE_TYPE_LABELS[type].many.toLowerCase()} yet.`
        }
      />
      <Pagination
        page={list.page}
        pageSize={list.limit}
        rowCount={invoices.data?.length}
        onPageChange={list.setPage}
      />
    </div>
  )
}

import type { ReactNode } from 'react'
import { useLocation, useParams } from 'react-router'

import { ApiError } from '@/api/errors'
import { canOnInvoices } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { DataTable, type Column } from '@/components/DataTable'
import { DoneByRows } from '@/components/DoneByRows'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Money } from '@/components/Money'
import { NotFoundPage } from '@/components/NotFoundPage'
import { Panel } from '@/components/Panel'
import { PageHeader, type Crumb } from '@/components/PageHeader'
import { RecordLayout } from '@/components/RecordLayout'
import { PageSpinner } from '@/components/PageSpinner'
import { ProgressTrack } from '@/components/ProgressTrack'
import { PartnerName } from '@/components/RecordNames'
import { StateBadge } from '@/components/StateBadge'
import { formatDate, today } from '@/lib/dates'
import { CurrencyCode } from '@/features/company/CurrencyCode'
import { useCurrency } from '@/features/company/queries'
import { DownloadPdfButton } from '@/features/documents/DownloadPdfButton'
import { InvoiceActions } from './InvoiceActions'
import { InvoiceOrderLink, OverdueBadge, PaymentBadge } from './InvoiceBits'
import { invoiceTitle } from './invoiceInfo'
import { InvoiceLinesTable } from './InvoiceLinesTable'
import { INVOICE_TYPE_LABELS, useInvoice, type Invoice } from './queries'

type Payment = Invoice['payments'][number]

function paymentColumns(currency: string | undefined): Column<Payment>[] {
  return [
    { header: 'Date', cell: (payment) => formatDate(payment.paid_on) },
    { header: 'Reference', cell: (payment) => payment.reference ?? '—' },
    { header: 'Recorded by', cell: (payment) => payment.created_by.name },
    {
      // In the heading, like the PDF, rather than on every row.
      header: currency ? `Amount (${currency})` : 'Amount',
      className: 'text-right',
      cell: (payment) => <Money value={payment.amount} />,
    },
  ]
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </>
  )
}

export function InvoicePage() {
  const id = Number(useParams().invoiceId)
  const { user } = useAuth()
  const invoice = useInvoice(id)
  const currency = useCurrency()
  // Opened from an order, the trail leads back through that order.
  const fromOrder = (useLocation().state as { trail?: Crumb[] } | null)?.trail

  if (invoice.isPending) return <PageSpinner />
  if (invoice.error instanceof ApiError && invoice.error.status === 404) return <NotFoundPage />
  if (invoice.isError) {
    return <ErrorMessage error={invoice.error} onRetry={() => invoice.refetch()} />
  }

  const { data } = invoice
  const customer = data.invoice_type === 'customer_invoice'
  const editable = data.state === 'draft' && canOnInvoices(user, data.invoice_type)

  return (
    <RecordLayout
      header={
        <PageHeader
          pageTitle={invoiceTitle(data)}
          trail={fromOrder ?? [{ to: `/invoices?type=${data.invoice_type}`, label: 'Invoices' }]}
          title={
            <>
              {invoiceTitle(data)}
              <StateBadge state={data.state} />
              <PaymentBadge invoice={data} />
              <OverdueBadge invoice={data} today={today()} />
            </>
          }
        />
      }
      status={
        <>
          <ProgressTrack steps={['draft', 'posted']} state={data.state} />
        </>
      }
      actions={
        <>
          {/* Anyone who can read the invoice can print it, unless it was cancelled. */}
          {data.state !== 'cancelled' && (
            <DownloadPdfButton
              source={{ kind: 'invoice', id: data.id }}
              fallbackName={invoiceTitle(data)}
            />
          )}
          <InvoiceActions invoice={data} />
        </>
      }
      details={
        <Panel>
          <dl className="grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <Detail label="Type">{INVOICE_TYPE_LABELS[data.invoice_type].one}</Detail>
            <Detail label={customer ? 'Customer' : 'Supplier'}>
              <PartnerName id={data.partner_id} />
            </Detail>
            <Detail label="Order">
              <InvoiceOrderLink invoice={data} />
            </Detail>
            <Detail label="Invoice date">
              {data.invoice_date ? formatDate(data.invoice_date) : 'Set when posted'}
            </Detail>
            <Detail label="Due date">
              {data.due_date ? formatDate(data.due_date) : 'Set when posted'}
            </Detail>
            {data.posted_at && (
              <DoneByRows label="Posted" at={data.posted_at} by={data.posted_by} />
            )}
            <DoneByRows label="Created" at={data.created_at} by={data.created_by} />
          </dl>
        </Panel>
      }
    >
      <section className="grid min-w-0 gap-3">
        <h2 className="text-lg font-semibold">Lines</h2>
        <InvoiceLinesTable invoice={data} editable={editable} />
        {/* Under the lines and to the right, as on a printed invoice. */}
        <dl className="grid w-full grid-cols-[1fr_auto] gap-y-2 justify-self-end text-sm sm:w-80 [&_dd]:pl-8">
          {data.state === 'posted' ? (
            <>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="text-right font-medium">
                <Money value={data.amount_total ?? '0'} />
                <CurrencyCode />
              </dd>
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="text-right">
                <Money value={data.amount_paid} />
                <CurrencyCode />
              </dd>
              <dt className="border-t pt-2 font-medium">Amount due</dt>
              <dd className="border-t pt-2 text-right text-lg font-semibold">
                <Money value={data.amount_due} />
                <CurrencyCode />
              </dd>
            </>
          ) : (
            // A draft owes nothing yet, and a cancelled invoice no longer counts.
            <>
              <dt className="font-medium">Total</dt>
              <dd className="text-right text-lg font-semibold">
                <Money value={data.amount_total ?? '0'} />
                <CurrencyCode />
              </dd>
            </>
          )}
        </dl>
      </section>

      <section className="grid min-w-0 gap-3">
        <h2 className="text-lg font-semibold">Payments</h2>
        <DataTable
          columns={paymentColumns(currency)}
          rows={data.payments}
          rowKey={(payment) => payment.id}
          isPending={false}
          error={null}
          emptyMessage={
            data.state === 'posted'
              ? 'No payments yet.'
              : 'Payments can be recorded once the invoice is posted.'
          }
        />
      </section>
    </RecordLayout>
  )
}

import { toast } from 'sonner'

import { canOnInvoices } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DisabledReason } from '@/components/DisabledReason'
import { Button } from '@/components/ui/button'
import { toThousandths } from '@/lib/quantity'
import { invoiceTitle } from './invoiceInfo'
import { PostInvoiceDialog } from './PostInvoiceDialog'
import { useCancelInvoice, type Invoice } from './queries'
import { RegisterPaymentDialog } from './RegisterPaymentDialog'

// Posting, cancelling and recording payments are for managers of the invoice's module.
export function InvoiceActions({ invoice }: { invoice: Invoice }) {
  const { user } = useAuth()
  const cancel = useCancelInvoice(invoice.id)
  if (!canOnInvoices(user, invoice.invoice_type, 'manager')) return null

  const draft = invoice.state === 'draft'
  const posted = invoice.state === 'posted'
  const hasPayments = invoice.payments.length > 0
  const due = posted && toThousandths(invoice.amount_due) > 0n

  return (
    <>
      {draft && (
        <DisabledReason reason={invoice.lines.length === 0 ? 'Add at least one line first.' : null}>
          {invoice.lines.length === 0 ? (
            <Button disabled>Post</Button>
          ) : (
            <PostInvoiceDialog invoice={invoice} />
          )}
        </DisabledReason>
      )}
      {due && <RegisterPaymentDialog invoice={invoice} />}
      {(draft || posted) && (
        <DisabledReason
          reason={hasPayments ? "An invoice with payments can't be cancelled." : null}
        >
          <ConfirmDialog
            trigger={
              <Button variant="outline" disabled={hasPayments}>
                Cancel invoice
              </Button>
            }
            title={`Cancel ${invoiceTitle(invoice)}?`}
            description={
              draft
                ? 'The draft is kept for reference, and its quantities can be invoiced again.'
                : 'The invoice keeps its number but no longer counts, and its quantities can be invoiced again. This cannot be undone.'
            }
            confirmLabel="Cancel invoice"
            destructive
            onConfirm={async () => {
              await cancel.mutateAsync()
              toast.success(`Cancelled ${invoiceTitle(invoice)}`)
            }}
          />
        </DisabledReason>
      )}
    </>
  )
}

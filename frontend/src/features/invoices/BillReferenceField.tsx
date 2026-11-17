import { toast } from 'sonner'

import { InlineTextField } from '@/components/InlineTextField'
import { useUpdateInvoice, type Invoice } from './queries'

// The supplier's own number for a draft vendor bill, edited where it's shown. It usually
// comes from the purchase order; a second bill for the rest of the goods has its own.
export function BillReferenceField({ invoice }: { invoice: Invoice }) {
  const update = useUpdateInvoice(invoice.id)
  return (
    <InlineTextField
      label="Supplier reference"
      value={invoice.partner_reference}
      placeholder="Their bill number"
      onSave={async (partner_reference) => {
        await update.mutateAsync({ partner_reference })
        toast.success('Supplier reference saved')
      }}
    />
  )
}

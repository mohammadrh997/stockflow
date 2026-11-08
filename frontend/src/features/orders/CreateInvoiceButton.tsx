import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { ApiError, errorMessage } from '@/api/errors'
import { DisabledReason } from '@/components/DisabledReason'
import type { Crumb } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { useCreateInvoice } from '@/features/invoices/queries'

type Props = {
  kind: 'invoice' | 'bill'
  order: { id: number; reference: string }
  // Why nothing can be invoiced, when the page can tell; otherwise the server decides.
  disabledReason: string | null
  trail: Crumb[]
}

// Drafts an invoice or bill for everything moved and not yet invoiced, then opens it.
export function CreateInvoiceButton({ kind, order, disabledReason, trail }: Props) {
  const create = useCreateInvoice()
  const navigate = useNavigate()
  const label = kind === 'invoice' ? 'Create invoice' : 'Create bill'

  async function handleClick() {
    try {
      const invoice = await create.mutateAsync(
        kind === 'invoice' ? { sales_order_id: order.id } : { purchase_order_id: order.id },
      )
      toast.success(`Drafted a ${kind} for ${order.reference}`)
      navigate(`/invoices/${invoice.id}`, { state: { trail } })
    } catch (error) {
      // The server only names the order, so say what it means.
      toast.error(
        error instanceof ApiError && error.status === 409
          ? `Nothing left to invoice on ${order.reference}.`
          : errorMessage(error),
      )
    }
  }

  return (
    <DisabledReason reason={disabledReason}>
      <Button disabled={disabledReason !== null || create.isPending} onClick={handleClick}>
        {create.isPending ? 'Creating…' : label}
      </Button>
    </DisabledReason>
  )
}

import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { useCancelBackorder, type Transfer } from './queries'

export function CancelBackorderButton({ transfer }: { transfer: Transfer }) {
  const cancel = useCancelBackorder(transfer.id)
  const receipt = transfer.transfer_type === 'receipt'

  return (
    <ConfirmDialog
      trigger={<Button variant="outline">Cancel backorder</Button>}
      title={`Cancel backorder ${transfer.reference}?`}
      description={
        receipt
          ? "The goods still expected won't be received, and the purchase order is closed as received with what arrived. This cannot be undone."
          : "The goods still to ship won't be delivered, their reservation is released, and the sales order is closed as delivered with what shipped. This cannot be undone."
      }
      confirmLabel="Cancel backorder"
      destructive
      onConfirm={async () => {
        await cancel.mutateAsync()
        toast.success(`Cancelled ${transfer.reference}`)
      }}
    />
  )
}

import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PartnerForm } from './PartnerForm'
import { toPartnerPayload } from './partnerValues'
import { useCreatePartner, type Partner } from './queries'

type Props = {
  // The name typed in the picker; the dialog is open while this is set.
  name: string | null
  role: 'customer' | 'supplier'
  onClose: () => void
  onCreated: (partner: Partner) => void
}

// Creates a customer or supplier without leaving the order being edited.
export function QuickCreatePartnerDialog({ name, role, onClose, onCreated }: Props) {
  const createPartner = useCreatePartner()

  return (
    <Dialog open={name !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New {role}</DialogTitle>
          <DialogDescription>It is used on this order once created.</DialogDescription>
        </DialogHeader>
        {name !== null && (
          <PartnerForm
            defaultValues={{
              name,
              email: '',
              phone: '',
              address: '',
              is_customer: role === 'customer',
              is_supplier: role === 'supplier',
            }}
            submitLabel={`Create ${role}`}
            onSubmit={async (values) => {
              const partner = await createPartner.mutateAsync(toPartnerPayload(values))
              toast.success(`Created ${partner.name}`)
              onCreated(partner)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

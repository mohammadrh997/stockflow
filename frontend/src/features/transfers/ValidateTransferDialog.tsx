import { useState } from 'react'
import { toast } from 'sonner'

import { ErrorMessage } from '@/components/ErrorMessage'
import { FormField } from '@/components/FormField'
import { LocationPicker } from '@/components/LocationPicker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useValidateTransfer, type Transfer } from './queries'

const COPY = {
  receipt: {
    label: 'Put the goods in',
    empty: "Warehouse's default location",
    description: 'The goods are added to stock and the purchase order is marked received.',
  },
  delivery: {
    label: 'Take the goods from',
    empty: 'Automatic (default location first, then the others)',
    description:
      'The goods leave stock and the sales order is marked delivered. A chosen location must hold the full quantity.',
  },
}

export function ValidateTransferDialog({ transfer }: { transfer: Transfer }) {
  const validate = useValidateTransfer(transfer.id)
  const [open, setOpen] = useState(false)
  const [locationId, setLocationId] = useState<number | null>(null)
  const [error, setError] = useState<unknown>(null)
  const copy = COPY[transfer.transfer_type === 'receipt' ? 'receipt' : 'delivery']

  function handleOpenChange(next: boolean) {
    if (validate.isPending) return
    setOpen(next)
    setLocationId(null)
    setError(null)
  }

  async function handleValidate() {
    setError(null)
    try {
      await validate.mutateAsync(locationId)
      toast.success(`Validated ${transfer.reference}`)
      setOpen(false)
    } catch (e) {
      setError(e)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Validate</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Validate {transfer.reference}?</DialogTitle>
          <DialogDescription>{copy.description} This cannot be undone.</DialogDescription>
        </DialogHeader>
        {error !== null && <ErrorMessage error={error} />}
        <FormField label={copy.label} htmlFor="validate-location">
          <LocationPicker
            id="validate-location"
            warehouseId={transfer.warehouse_id}
            value={locationId}
            onChange={setLocationId}
            emptyLabel={copy.empty}
            disabled={validate.isPending}
          />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={validate.isPending} onClick={handleValidate}>
            {validate.isPending ? 'Validating…' : 'Validate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

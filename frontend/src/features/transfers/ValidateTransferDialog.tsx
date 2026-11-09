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
import { Input } from '@/components/ui/input'
import { useProduct } from '@/features/products/queries'
import { formatQuantity, QUANTITY_PATTERN } from '@/lib/format'
import { compareQuantities, toThousandths } from '@/lib/quantity'
import { useValidateTransfer, type Transfer, type TransferLine } from './queries'

const COPY = {
  receipt: {
    label: 'Put the goods in',
    empty: "Warehouse's default location",
    done: 'Received now',
    description:
      'Enter what arrived. The goods are added to stock; anything still missing stays on a backorder.',
  },
  delivery: {
    label: 'Take the goods from',
    empty: 'Automatic (default location first, then the others)',
    done: 'Shipped now',
    description:
      'Enter what is shipped. The goods leave stock; anything not shipped stays on a backorder. A chosen location must hold what is shipped.',
  },
}

function LineRow({
  line,
  value,
  error,
  disabled,
  onChange,
}: {
  line: TransferLine
  value: string
  error: string | undefined
  disabled: boolean
  onChange: (value: string) => void
}) {
  const product = useProduct(line.product_id)
  const name = product.data?.name ?? `Product #${line.product_id}`

  return (
    <li className="grid gap-1">
      <div className="grid grid-cols-[1fr_auto_6rem] items-center gap-3 text-sm">
        <span className="truncate font-medium">{name}</span>
        <span className="text-muted-foreground">of {formatQuantity(line.quantity)}</span>
        <Input
          aria-label={`Quantity for ${name}`}
          aria-invalid={error ? true : undefined}
          inputMode="decimal"
          className="h-8 text-right tabular-nums"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {error && <span className="text-right text-xs text-destructive">{error}</span>}
    </li>
  )
}

function checkLine(value: string, planned: string): string | null {
  if (!QUANTITY_PATTERN.test(value)) return 'Use a number with up to 3 decimals.'
  if (compareQuantities(value, planned) > 0) return `At most ${formatQuantity(planned)}.`
  return null
}

export function ValidateTransferDialog({ transfer }: { transfer: Transfer }) {
  const validate = useValidateTransfer(transfer.id)
  const [open, setOpen] = useState(false)
  const [locationId, setLocationId] = useState<number | null>(null)
  const [quantities, setQuantities] = useState<Record<number, string>>({})
  const [lineErrors, setLineErrors] = useState<Record<number, string>>({})
  const [error, setError] = useState<unknown>(null)
  const copy = COPY[transfer.transfer_type === 'receipt' ? 'receipt' : 'delivery']

  const quantityOf = (line: TransferLine) => quantities[line.id] ?? formatQuantity(line.quantity)
  const partial = transfer.lines.some(
    (line) =>
      QUANTITY_PATTERN.test(quantityOf(line)) &&
      compareQuantities(quantityOf(line), line.quantity) < 0,
  )

  function handleOpenChange(next: boolean) {
    if (validate.isPending) return
    setOpen(next)
    setLocationId(null)
    setQuantities({})
    setLineErrors({})
    setError(null)
  }

  async function handleValidate() {
    setError(null)
    const errors: Record<number, string> = {}
    for (const line of transfer.lines) {
      const problem = checkLine(quantityOf(line).trim(), line.quantity)
      if (problem) errors[line.id] = problem
    }
    setLineErrors(errors)
    if (Object.keys(errors).length > 0) return

    const lines = transfer.lines.map((line) => ({
      line_id: line.id,
      quantity: quantityOf(line).trim(),
    }))
    if (lines.length > 0 && lines.every((line) => toThousandths(line.quantity) === 0n)) {
      setError(new Error('Enter a quantity on at least one line.'))
      return
    }

    try {
      // Everything moving needs no per-line detail: the server then moves every line in full.
      await validate.mutateAsync({ locationId, lines: partial ? lines : undefined })
      toast.success(
        partial
          ? `Validated ${transfer.reference}; the rest is on a backorder`
          : `Validated ${transfer.reference}`,
      )
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Validate {transfer.reference}?</DialogTitle>
          <DialogDescription>{copy.description} This cannot be undone.</DialogDescription>
        </DialogHeader>
        {error !== null && (
          <ErrorMessage
            error={error}
            message={error instanceof Error && !('status' in error) ? error.message : undefined}
          />
        )}
        <section className="grid gap-2" aria-label={copy.done}>
          <div className="grid grid-cols-[1fr_auto_6rem] gap-3 text-xs font-medium text-muted-foreground">
            <span>Product</span>
            <span>Planned</span>
            <span className="text-right">{copy.done}</span>
          </div>
          <ul className="grid gap-2">
            {transfer.lines.map((line) => (
              <LineRow
                key={line.id}
                line={line}
                value={quantityOf(line)}
                error={lineErrors[line.id]}
                disabled={validate.isPending}
                onChange={(value) => setQuantities((current) => ({ ...current, [line.id]: value }))}
              />
            ))}
          </ul>
          {partial && (
            <p className="text-sm text-muted-foreground">
              What isn't moved now goes to a new backorder, which stays ready.
            </p>
          )}
        </section>
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
            {validate.isPending ? 'Validating…' : partial ? 'Validate part' : 'Validate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

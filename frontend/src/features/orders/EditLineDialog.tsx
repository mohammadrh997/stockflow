import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { applyFieldErrors } from '@/api/errors'
import { ErrorMessage } from '@/components/ErrorMessage'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { quantityRules, unitPriceRules } from './lineRules'
import type { LineChanges, OrderLine } from './types'

type Props = {
  line: OrderLine
  onSave: (changes: LineChanges) => Promise<unknown>
}

export function EditLineDialog({ line, onSave }: Props) {
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const defaultValues = { quantity: line.quantity, unit_price: line.unit_price }
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LineChanges>({ defaultValues })

  function handleOpenChange(next: boolean) {
    setOpen(next)
    reset(defaultValues)
    setFormError(null)
  }

  async function submit(values: LineChanges) {
    setFormError(null)
    try {
      await onSave(values)
      setOpen(false)
    } catch (error) {
      setFormError(applyFieldErrors(error, ['quantity', 'unit_price'], setError).join(' ') || null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form className="grid gap-4" onSubmit={handleSubmit(submit)} noValidate>
          <DialogHeader>
            <DialogTitle>Edit line</DialogTitle>
          </DialogHeader>
          {formError && <ErrorMessage message={formError} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Quantity" htmlFor="edit-quantity" error={errors.quantity?.message}>
              <Input
                id="edit-quantity"
                inputMode="decimal"
                aria-invalid={errors.quantity ? true : undefined}
                {...register('quantity', quantityRules)}
              />
            </FormField>
            <FormField
              label="Unit price"
              htmlFor="edit-unit-price"
              error={errors.unit_price?.message}
            >
              <Input
                id="edit-unit-price"
                inputMode="decimal"
                aria-invalid={errors.unit_price ? true : undefined}
                {...register('unit_price', { ...unitPriceRules, required: 'Enter a price.' })}
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

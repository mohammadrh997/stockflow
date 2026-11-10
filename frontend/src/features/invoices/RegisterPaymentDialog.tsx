import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { applyFieldErrors } from '@/api/errors'
import { ErrorMessage } from '@/components/ErrorMessage'
import { FormField } from '@/components/FormField'
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group'
import { useCurrency } from '@/features/company/queries'
import { today } from '@/lib/dates'
import { formatMoney, PRICE_PATTERN } from '@/lib/format'
import { compareQuantities, toThousandths } from '@/lib/quantity'
import { useRegisterPayment, type Invoice } from './queries'

type Values = { amount: string; paid_on: string; reference: string }

const FIELDS = ['amount', 'paid_on', 'reference'] as const

export function RegisterPaymentDialog({ invoice }: { invoice: Invoice }) {
  const pay = useRegisterPayment(invoice.id)
  const currency = useCurrency()
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const defaults = { amount: invoice.amount_due, paid_on: today(), reference: '' }
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ defaultValues: defaults })

  function handleOpenChange(next: boolean) {
    if (isSubmitting) return
    setOpen(next)
    reset(defaults)
    setFormError(null)
  }

  async function submit(values: Values) {
    setFormError(null)
    try {
      await pay.mutateAsync({
        amount: values.amount.trim(),
        paid_on: values.paid_on,
        reference: values.reference.trim() || null,
      })
      toast.success(`Recorded a payment of ${formatMoney(values.amount)}`)
      setOpen(false)
    } catch (error) {
      setFormError(applyFieldErrors(error, FIELDS, setError).join(' ') || null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Register payment</Button>
      </DialogTrigger>
      <DialogContent>
        <form className="grid gap-4" onSubmit={handleSubmit(submit)} noValidate>
          <DialogHeader>
            <DialogTitle>Register a payment</DialogTitle>
            <DialogDescription>
              {formatMoney(invoice.amount_due)} is still due on {invoice.number}.
            </DialogDescription>
          </DialogHeader>
          {formError && <ErrorMessage message={formError} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Amount" htmlFor="payment-amount" error={errors.amount?.message}>
              <InputGroup>
                <InputGroupInput
                  id="payment-amount"
                  inputMode="decimal"
                  aria-invalid={errors.amount ? true : undefined}
                  {...register('amount', {
                    required: 'Enter an amount.',
                    pattern: {
                      value: PRICE_PATTERN,
                      message: 'Use a number with up to 2 decimals.',
                    },
                    validate: (value) =>
                      toThousandths(value) <= 0n
                        ? 'Must be more than 0.'
                        : compareQuantities(value, invoice.amount_due) <= 0 ||
                          `At most ${formatMoney(invoice.amount_due)} is due.`,
                  })}
                />
                {currency && (
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>{currency}</InputGroupText>
                  </InputGroupAddon>
                )}
              </InputGroup>
            </FormField>
            <FormField label="Paid on" htmlFor="payment-date" error={errors.paid_on?.message}>
              <Input
                id="payment-date"
                type="date"
                aria-invalid={errors.paid_on ? true : undefined}
                {...register('paid_on', { required: 'Enter the payment date.' })}
              />
            </FormField>
          </div>
          <FormField
            label="Reference (optional)"
            htmlFor="payment-reference"
            error={errors.reference?.message}
            hint="E.g. a bank transfer or cheque number."
          >
            <Input
              id="payment-reference"
              {...register('reference', {
                maxLength: { value: 100, message: 'Use at most 100 characters.' },
              })}
            />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Recording…' : 'Record payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { ApiError, errorMessage } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUpdateInvoice, type Invoice } from './queries'

type Values = { reference: string }

// The supplier's own number for a draft vendor bill, edited where it's shown. It usually
// comes from the purchase order; a second bill for the rest of the goods has its own.
export function BillReferenceField({ invoice }: { invoice: Invoice }) {
  const update = useUpdateInvoice(invoice.id)
  const [problem, setProblem] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { isDirty, isSubmitting },
  } = useForm<Values>({ defaultValues: { reference: invoice.partner_reference ?? '' } })

  async function submit(values: Values) {
    setProblem(null)
    try {
      // Empty means none: the server clears it.
      await update.mutateAsync({ partner_reference: values.reference.trim() || null })
      reset(values)
      toast.success('Supplier reference saved')
    } catch (error) {
      // A number already entered for this supplier says which bill has it.
      setProblem(
        error instanceof ApiError && error.status === 409
          ? String(error.detail)
          : errorMessage(error),
      )
    }
  }

  return (
    <form className="grid gap-1" onSubmit={handleSubmit(submit)} noValidate>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Supplier reference"
          className="h-8 w-48"
          placeholder="Their bill number"
          maxLength={100}
          disabled={isSubmitting}
          aria-invalid={problem ? true : undefined}
          {...register('reference')}
        />
        {isDirty && (
          <>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isSubmitting}
              onClick={() => {
                reset()
                setProblem(null)
              }}
            >
              Discard
            </Button>
          </>
        )}
      </div>
      {problem && <p className="text-sm text-destructive">{problem}</p>}
    </form>
  )
}

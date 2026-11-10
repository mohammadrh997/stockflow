import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { applyFieldErrors } from '@/api/errors'
import { ErrorMessage } from '@/components/ErrorMessage'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useUpdateCompany, type Company, type CompanyUpdate } from './queries'

type Values = { name: string; address: string; phone: string; email: string; currency: string }

const FIELDS = ['name', 'address', 'phone', 'email', 'currency'] as const

function formValues(company: Company): Values {
  return {
    name: company.name,
    address: company.address ?? '',
    phone: company.phone ?? '',
    email: company.email ?? '',
    currency: company.currency,
  }
}

export function CompanyForm({ company }: { company: Company }) {
  const updateCompany = useUpdateCompany()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ defaultValues: formValues(company) })

  async function submit(values: Values) {
    setFormError(null)
    // The API rejects empty strings for the optional fields; null clears them.
    const body: CompanyUpdate = {
      name: values.name.trim(),
      address: values.address.trim() || null,
      phone: values.phone.trim() || null,
      email: values.email.trim() || null,
    }
    // Only sent when it changes, so a locked currency never gets in the way of other edits.
    const currency = values.currency.trim().toUpperCase()
    if (currency !== company.currency) body.currency = currency
    try {
      reset(formValues(await updateCompany.mutateAsync(body)))
      toast.success('Company saved')
    } catch (error) {
      setFormError(applyFieldErrors(error, FIELDS, setError).join(' ') || null)
    }
  }

  return (
    <form className="grid max-w-xl gap-4" onSubmit={handleSubmit(submit)} noValidate>
      {formError && <ErrorMessage message={formError} />}
      <fieldset disabled={isSubmitting} className="grid gap-4">
        <FormField label="Name" htmlFor="company-name" error={errors.name?.message}>
          <Input
            id="company-name"
            aria-invalid={errors.name ? true : undefined}
            {...register('name', {
              validate: (value) => value.trim() !== '' || 'Enter a name.',
              maxLength: { value: 200, message: 'Use at most 200 characters.' },
            })}
          />
        </FormField>
        <FormField label="Address" htmlFor="company-address" error={errors.address?.message}>
          <Textarea
            id="company-address"
            rows={3}
            aria-invalid={errors.address ? true : undefined}
            {...register('address', {
              maxLength: { value: 500, message: 'Use at most 500 characters.' },
            })}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Phone" htmlFor="company-phone" error={errors.phone?.message}>
            <Input
              id="company-phone"
              type="tel"
              aria-invalid={errors.phone ? true : undefined}
              {...register('phone', {
                maxLength: { value: 30, message: 'Use at most 30 characters.' },
              })}
            />
          </FormField>
          <FormField label="Email" htmlFor="company-email" error={errors.email?.message}>
            <Input
              id="company-email"
              type="email"
              aria-invalid={errors.email ? true : undefined}
              {...register('email')}
            />
          </FormField>
        </div>
        <FormField
          label="Currency"
          htmlFor="company-currency"
          error={errors.currency?.message}
          hint={
            company.currency_locked
              ? `Invoices have already been posted in ${company.currency}, so it can't change.`
              : 'A three-letter code such as USD or IQD. It locks once the first invoice is posted.'
          }
        >
          <Input
            id="company-currency"
            className="w-24 uppercase"
            maxLength={3}
            readOnly={company.currency_locked}
            aria-invalid={errors.currency ? true : undefined}
            {...register('currency', {
              validate: (value) =>
                /^[A-Za-z]{3}$/.test(value.trim()) || 'Use a three-letter code such as USD.',
            })}
          />
        </FormField>
      </fieldset>
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}

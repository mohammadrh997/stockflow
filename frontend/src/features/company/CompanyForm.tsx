import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { applyFieldErrors } from '@/api/errors'
import { ErrorMessage } from '@/components/ErrorMessage'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useUpdateCompany, type Company, type CompanyUpdate, type Currency } from './queries'

type Values = { name: string; address: string; phone: string; email: string; currency: Currency }

// The server's list. Typed against it, so a currency added there fails the build until named here.
const CURRENCIES: Record<Currency, string> = {
  USD: 'US dollar',
  IQD: 'Iraqi dinar',
  EUR: 'Euro',
  GBP: 'British pound',
  SAR: 'Saudi riyal',
  AED: 'UAE dirham',
  KWD: 'Kuwaiti dinar',
  JOD: 'Jordanian dinar',
  TRY: 'Turkish lira',
}

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
    control,
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
    if (values.currency !== company.currency) body.currency = values.currency
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
              : 'It locks once the first invoice is posted.'
          }
        >
          <Controller
            name="currency"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={company.currency_locked}
              >
                <SelectTrigger id="company-currency" className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CURRENCIES).map(([code, name]) => (
                    <SelectItem key={code} value={code}>
                      {code} · {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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

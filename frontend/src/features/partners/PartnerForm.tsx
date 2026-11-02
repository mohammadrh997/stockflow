import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { applyFieldErrors } from '@/api/errors'
import { ErrorMessage } from '@/components/ErrorMessage'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { PartnerFormValues } from './partnerValues'

const FIELDS = ['name', 'email', 'phone', 'address', 'is_customer', 'is_supplier'] as const

const EMPTY: PartnerFormValues = {
  name: '',
  email: '',
  phone: '',
  address: '',
  is_customer: false,
  is_supplier: false,
}

type Props = {
  defaultValues?: PartnerFormValues
  readOnly?: boolean
  submitLabel: string
  onSubmit: (values: PartnerFormValues) => Promise<unknown>
}

export function PartnerForm({ defaultValues = EMPTY, readOnly, submitLabel, onSubmit }: Props) {
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PartnerFormValues>({ defaultValues })

  async function submit(values: PartnerFormValues) {
    setFormError(null)
    try {
      await onSubmit(values)
    } catch (error) {
      setFormError(applyFieldErrors(error, FIELDS, setError).join(' ') || null)
    }
  }

  return (
    <form className="grid max-w-xl gap-4" onSubmit={handleSubmit(submit)} noValidate>
      {formError && <ErrorMessage message={formError} />}
      <fieldset disabled={readOnly || isSubmitting} className="grid gap-4">
        <FormField label="Name" htmlFor="name" error={errors.name?.message}>
          <Input
            id="name"
            aria-invalid={errors.name ? true : undefined}
            {...register('name', {
              validate: (value) => value.trim() !== '' || 'Enter a name.',
              maxLength: { value: 200, message: 'Use at most 200 characters.' },
            })}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Email" htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              aria-invalid={errors.email ? true : undefined}
              {...register('email')}
            />
          </FormField>
          <FormField label="Phone" htmlFor="phone" error={errors.phone?.message}>
            <Input
              id="phone"
              type="tel"
              aria-invalid={errors.phone ? true : undefined}
              {...register('phone', {
                maxLength: { value: 30, message: 'Use at most 30 characters.' },
              })}
            />
          </FormField>
        </div>
        <FormField label="Address" htmlFor="address" error={errors.address?.message}>
          <Textarea
            id="address"
            rows={3}
            aria-invalid={errors.address ? true : undefined}
            {...register('address', {
              maxLength: { value: 500, message: 'Use at most 500 characters.' },
            })}
          />
        </FormField>
        <div className="flex flex-wrap gap-6">
          {(['is_customer', 'is_supplier'] as const).map((name) => (
            <Controller
              key={name}
              name={name}
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={name}
                    checked={field.value}
                    onCheckedChange={(state) => field.onChange(state === true)}
                  />
                  <Label htmlFor={name}>{name === 'is_customer' ? 'Customer' : 'Supplier'}</Label>
                </div>
              )}
            />
          ))}
        </div>
      </fieldset>
      {!readOnly && (
        <div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : submitLabel}
          </Button>
        </div>
      )}
    </form>
  )
}

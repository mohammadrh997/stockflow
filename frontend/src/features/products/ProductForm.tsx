import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { applyFieldErrors } from '@/api/errors'
import { can } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { ErrorMessage } from '@/components/ErrorMessage'
import { FormField } from '@/components/FormField'
import { SaveBar } from '@/components/SaveBar'
import { Input } from '@/components/ui/input'
import { CategoryPicker } from '@/features/categories/CategoryPicker'
import { PRICE_PATTERN } from '@/lib/format'

export type ProductFormValues = {
  name: string
  sku: string
  sale_price: string
  cost_price: string
  category_id: number | null
}

const FIELDS = ['name', 'sku', 'sale_price', 'cost_price', 'category_id'] as const

const EMPTY: ProductFormValues = {
  name: '',
  sku: '',
  sale_price: '',
  cost_price: '0.00',
  category_id: null,
}

const priceRules = {
  required: 'Enter a price.',
  pattern: { value: PRICE_PATTERN, message: 'Use a number with up to 2 decimals.' },
}

type Props = {
  defaultValues?: ProductFormValues
  readOnly?: boolean
  submitLabel: string
  // Which price comes first, e.g. the cost price when creating from a purchase order.
  emphasise?: 'sale_price' | 'cost_price'
  // Editing a saved record: Save waits for a change (see SaveBar).
  trackChanges?: boolean
  onSubmit: (values: ProductFormValues) => Promise<unknown>
}

export function ProductForm({
  defaultValues = EMPTY,
  readOnly,
  submitLabel,
  emphasise,
  trackChanges = false,
  onSubmit,
}: Props) {
  const { user } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProductFormValues>({ defaultValues })

  const salePrice = (
    <FormField
      key="sale_price"
      label="Sale price"
      htmlFor="sale_price"
      error={errors.sale_price?.message}
    >
      <Input
        id="sale_price"
        inputMode="decimal"
        aria-invalid={errors.sale_price ? true : undefined}
        {...register('sale_price', priceRules)}
      />
    </FormField>
  )
  const costPrice = (
    <FormField
      key="cost_price"
      label="Cost price"
      htmlFor="cost_price"
      error={errors.cost_price?.message}
    >
      <Input
        id="cost_price"
        inputMode="decimal"
        aria-invalid={errors.cost_price ? true : undefined}
        {...register('cost_price', priceRules)}
      />
    </FormField>
  )

  async function submit(values: ProductFormValues) {
    setFormError(null)
    try {
      await onSubmit(values)
      reset(values) // what was saved is the new starting point
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
              required: 'Enter a name.',
              maxLength: { value: 200, message: 'Use at most 200 characters.' },
            })}
          />
        </FormField>
        <FormField
          label="SKU"
          htmlFor="sku"
          error={errors.sku?.message}
          hint="Saved in upper case. Must be unique."
        >
          <Input
            id="sku"
            className="uppercase"
            aria-invalid={errors.sku ? true : undefined}
            {...register('sku', {
              required: 'Enter a SKU.',
              maxLength: { value: 64, message: 'Use at most 64 characters.' },
            })}
          />
        </FormField>
        <FormField label="Category" htmlFor="category" error={errors.category_id?.message}>
          <Controller
            name="category_id"
            control={control}
            render={({ field }) => (
              <CategoryPicker
                id="category"
                value={field.value}
                onChange={field.onChange}
                placeholder="No category"
                // Only inventory managers can add categories (and edit products at all).
                allowCreate={can(user, 'inventory', 'manager')}
                className="sm:w-full"
                disabled={readOnly || isSubmitting}
              />
            )}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          {emphasise === 'cost_price' ? [costPrice, salePrice] : [salePrice, costPrice]}
        </div>
      </fieldset>
      {!readOnly && (
        <SaveBar
          label={submitLabel}
          isSubmitting={isSubmitting}
          isDirty={isDirty}
          onDiscard={() => reset()}
          trackChanges={trackChanges}
        />
      )}
    </form>
  )
}

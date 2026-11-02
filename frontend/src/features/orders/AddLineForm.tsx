import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'

import { applyFieldErrors } from '@/api/errors'
import { ErrorMessage } from '@/components/ErrorMessage'
import { FormField } from '@/components/FormField'
import { ProductPicker } from '@/components/ProductPicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useProduct } from '@/features/products/queries'
import { formatMoney } from '@/lib/format'
import { quantityRules, unitPriceRules } from './lineRules'
import type { LineHint, NewLine } from './types'

type Values = { product_id: number | null; quantity: string; unit_price: string }

const FIELDS = ['product_id', 'quantity', 'unit_price'] as const

const PRICE_LABELS = { cost_price: 'Cost price', sale_price: 'Sale price' }

type Props = {
  // The product price used when the unit price is left empty.
  defaultPrice: 'cost_price' | 'sale_price'
  hint?: LineHint
  onAdd: (line: NewLine) => Promise<unknown>
}

export function AddLineForm({ defaultPrice, hint, onAdd }: Props) {
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ defaultValues: { product_id: null, quantity: '', unit_price: '' } })
  const productId = useWatch({ control, name: 'product_id' })
  const product = useProduct(productId ?? 0, { enabled: productId !== null })
  const priceLabel = PRICE_LABELS[defaultPrice]
  const pricePlaceholder = product.data
    ? `${priceLabel}: ${formatMoney(product.data[defaultPrice])}`
    : priceLabel

  async function submit(values: Values) {
    setFormError(null)
    try {
      await onAdd({
        product_id: values.product_id!,
        quantity: values.quantity,
        unit_price: values.unit_price || undefined,
      })
      reset()
      // Straight back to the product picker for the next line, once reset() has re-rendered.
      setTimeout(() => setFocus('product_id'))
    } catch (error) {
      setFormError(applyFieldErrors(error, FIELDS, setError).join(' ') || null)
    }
  }

  return (
    <form
      className="grid gap-3 rounded-lg border p-4"
      onSubmit={handleSubmit(submit)}
      noValidate
      aria-label="Add line"
    >
      <h3 className="font-medium">Add a line</h3>
      {formError && <ErrorMessage message={formError} />}
      <div className="grid items-start gap-3 md:grid-cols-[auto_8rem_8rem_auto]">
        <FormField
          label="Product"
          htmlFor="line-product"
          error={errors.product_id?.message}
          hint={productId !== null && hint?.(productId)}
        >
          <Controller
            name="product_id"
            control={control}
            rules={{ validate: (value) => value !== null || 'Choose a product.' }}
            render={({ field }) => (
              <ProductPicker
                id="line-product"
                buttonRef={field.ref}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </FormField>
        <FormField label="Quantity" htmlFor="line-quantity" error={errors.quantity?.message}>
          <Input
            id="line-quantity"
            inputMode="decimal"
            disabled={isSubmitting}
            aria-invalid={errors.quantity ? true : undefined}
            {...register('quantity', quantityRules)}
          />
        </FormField>
        <FormField label="Unit price" htmlFor="line-unit-price" error={errors.unit_price?.message}>
          <Input
            id="line-unit-price"
            inputMode="decimal"
            placeholder={pricePlaceholder}
            disabled={isSubmitting}
            aria-invalid={errors.unit_price ? true : undefined}
            {...register('unit_price', unitPriceRules)}
          />
        </FormField>
        <Button type="submit" className="md:mt-[1.375rem]" disabled={isSubmitting}>
          {isSubmitting ? 'Adding…' : 'Add line'}
        </Button>
      </div>
    </form>
  )
}

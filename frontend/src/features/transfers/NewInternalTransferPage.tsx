import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { applyFieldErrors } from '@/api/errors'
import { ErrorMessage } from '@/components/ErrorMessage'
import { FormField } from '@/components/FormField'
import { LocationPicker } from '@/components/LocationPicker'
import { Panel } from '@/components/Panel'
import { PageHeader } from '@/components/PageHeader'
import { ProductPicker } from '@/components/ProductPicker'
import { WarehousePicker } from '@/components/WarehousePicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { quantityRules } from '@/features/orders/lineRules'
import { useWarehouses } from '@/features/warehouses/queries'
import { useCreateInternalTransfer } from './queries'

type Line = { product_id: number | null; quantity: string }

type Values = {
  warehouse_id: number | null
  from_location_id: number | null
  to_location_id: number | null
  lines: Line[]
  note: string
}

const FIELDS = ['from_location_id', 'to_location_id', 'note'] as const
const EMPTY_LINE: Line = { product_id: null, quantity: '' }

export function NewInternalTransferPage() {
  const navigate = useNavigate()
  const createTransfer = useCreateInternalTransfer()
  const warehouses = useWarehouses()
  const severalWarehouses = (warehouses.data?.length ?? 0) > 1
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: {
      warehouse_id: null,
      from_location_id: null,
      to_location_id: null,
      lines: [EMPTY_LINE],
      note: '',
    },
  })
  const lines = useFieldArray({ control, name: 'lines' })
  const chosenWarehouse = useWatch({ control, name: 'warehouse_id' })
  const fromLocation = useWatch({ control, name: 'from_location_id' })
  const warehouseId = severalWarehouses ? (chosenWarehouse ?? undefined) : warehouses.data?.[0]?.id

  async function submit(values: Values) {
    setFormError(null)
    try {
      const transfer = await createTransfer.mutateAsync({
        from_location_id: values.from_location_id!,
        to_location_id: values.to_location_id!,
        lines: values.lines.map((line) => ({
          product_id: line.product_id!,
          quantity: line.quantity,
        })),
        note: values.note.trim() || null,
      })
      toast.success(`Created ${transfer.reference}`)
      navigate(`/transfers/${transfer.id}`, { replace: true })
    } catch (error) {
      setFormError(applyFieldErrors(error, FIELDS, setError).join(' ') || null)
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="New internal transfer"
        trail={[{ to: '/transfers', label: 'Transfers' }]}
      />
      <p className="-mt-3 text-sm text-muted-foreground">
        Moves stock between two locations of the same warehouse. It is recorded as done right away.
      </p>
      <Panel>
        <form className="grid max-w-3xl gap-6" onSubmit={handleSubmit(submit)} noValidate>
          {formError && <ErrorMessage message={formError} />}
          <fieldset disabled={isSubmitting} className="grid gap-4 sm:grid-cols-3">
            {severalWarehouses && (
              <FormField label="Warehouse" htmlFor="warehouse" error={errors.warehouse_id?.message}>
                <Controller
                  name="warehouse_id"
                  control={control}
                  rules={{ validate: (value) => value !== null || 'Choose a warehouse.' }}
                  render={({ field }) => (
                    <WarehousePicker
                      id="warehouse"
                      value={field.value}
                      onChange={(id) => {
                        field.onChange(id)
                        setValue('from_location_id', null)
                        setValue('to_location_id', null)
                      }}
                    />
                  )}
                />
              </FormField>
            )}
            <FormField
              label="From"
              htmlFor="from-location"
              error={errors.from_location_id?.message}
            >
              <Controller
                name="from_location_id"
                control={control}
                rules={{ validate: (value) => value !== null || 'Choose where the stock is.' }}
                render={({ field }) => (
                  <LocationPicker
                    id="from-location"
                    warehouseId={warehouseId}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </FormField>
            <FormField label="To" htmlFor="to-location" error={errors.to_location_id?.message}>
              <Controller
                name="to_location_id"
                control={control}
                rules={{
                  validate: (value, values) =>
                    value === null
                      ? 'Choose where the stock goes.'
                      : value !== values.from_location_id || 'Choose a different location.',
                }}
                render={({ field }) => (
                  <LocationPicker
                    id="to-location"
                    warehouseId={warehouseId}
                    value={field.value}
                    onChange={field.onChange}
                    excludeId={fromLocation ?? undefined}
                  />
                )}
              />
            </FormField>
          </fieldset>

          <fieldset disabled={isSubmitting} className="grid gap-3">
            <legend className="mb-2 font-medium">Products</legend>
            {lines.fields.map((line, index) => (
              <div key={line.id} className="grid items-start gap-3 sm:grid-cols-[auto_8rem_auto]">
                <FormField
                  label="Product"
                  htmlFor={`line-${index}-product`}
                  error={errors.lines?.[index]?.product_id?.message}
                >
                  <Controller
                    name={`lines.${index}.product_id`}
                    control={control}
                    rules={{ validate: (value) => value !== null || 'Choose a product.' }}
                    render={({ field }) => (
                      <ProductPicker
                        id={`line-${index}-product`}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </FormField>
                <FormField
                  label="Quantity"
                  htmlFor={`line-${index}-quantity`}
                  error={errors.lines?.[index]?.quantity?.message}
                >
                  <Input
                    id={`line-${index}-quantity`}
                    inputMode="decimal"
                    aria-invalid={errors.lines?.[index]?.quantity ? true : undefined}
                    {...register(`lines.${index}.quantity`, quantityRules)}
                  />
                </FormField>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="sm:mt-[1.375rem]"
                  aria-label={`Remove line ${index + 1}`}
                  disabled={lines.fields.length === 1}
                  onClick={() => lines.remove(index)}
                >
                  <X />
                </Button>
              </div>
            ))}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => lines.append(EMPTY_LINE)}
              >
                <Plus />
                Add product
              </Button>
            </div>
          </fieldset>

          <FormField label="Note (optional)" htmlFor="note" error={errors.note?.message}>
            <Textarea
              id="note"
              rows={2}
              disabled={isSubmitting}
              {...register('note', {
                maxLength: { value: 500, message: 'Use at most 500 characters.' },
              })}
            />
          </FormField>

          <div>
            <Button type="submit" disabled={isSubmitting || warehouses.isPending}>
              {isSubmitting ? 'Moving stock…' : 'Move stock'}
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  )
}

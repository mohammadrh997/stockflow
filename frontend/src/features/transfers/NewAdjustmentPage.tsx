import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { ApiError, applyFieldErrors } from '@/api/errors'
import { ConfirmDialog } from '@/components/ConfirmDialog'
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
import { useWarehouses } from '@/features/warehouses/queries'
import { QUANTITY_PATTERN } from '@/lib/format'
import { useCreateAdjustment } from './queries'

type Line = { product_id: number | null; counted_quantity: string }

type Values = {
  warehouse_id: number | null
  location_id: number | null
  lines: Line[]
  note: string
}

const FIELDS = ['location_id', 'note'] as const
const EMPTY_LINE: Line = { product_id: null, counted_quantity: '' }

export function NewAdjustmentPage() {
  const navigate = useNavigate()
  const createAdjustment = useCreateAdjustment()
  const warehouses = useWarehouses()
  const severalWarehouses = (warehouses.data?.length ?? 0) > 1
  const [formError, setFormError] = useState<string | null>(null)
  const [toConfirm, setToConfirm] = useState<Values | null>(null)
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors },
  } = useForm<Values>({
    defaultValues: { warehouse_id: null, location_id: null, lines: [EMPTY_LINE], note: '' },
  })
  const lines = useFieldArray({ control, name: 'lines' })
  const chosenWarehouse = useWatch({ control, name: 'warehouse_id' })
  const warehouseId = severalWarehouses ? (chosenWarehouse ?? undefined) : warehouses.data?.[0]?.id

  async function save(values: Values) {
    try {
      const transfer = await createAdjustment.mutateAsync({
        location_id: values.location_id!,
        lines: values.lines.map((line) => ({
          product_id: line.product_id!,
          counted_quantity: line.counted_quantity,
        })),
        note: values.note.trim(),
      })
      toast.success(`Recorded ${transfer.reference}`)
      navigate(`/transfers/${transfer.id}`, { replace: true })
    } catch (error) {
      // Field errors belong on the form; anything else (like "nothing to adjust") stays in the dialog.
      if (error instanceof ApiError && error.status === 422) {
        setFormError(applyFieldErrors(error, FIELDS, setError).join(' ') || null)
        return
      }
      throw error
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader title="New stock adjustment" trail={[{ to: '/transfers', label: 'Transfers' }]} />
      <p className="-mt-3 text-sm text-muted-foreground">
        Enter what you physically counted at one location. The difference from the recorded stock is
        booked against Inventory Loss.
      </p>
      <Panel>
        <form
          className="grid max-w-3xl gap-6"
          onSubmit={handleSubmit((values) => {
            setFormError(null)
            setToConfirm(values)
          })}
          noValidate
        >
          {formError && <ErrorMessage message={formError} />}
          <div className="grid gap-4 sm:grid-cols-3">
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
                        setValue('location_id', null)
                      }}
                    />
                  )}
                />
              </FormField>
            )}
            <FormField label="Location" htmlFor="location" error={errors.location_id?.message}>
              <Controller
                name="location_id"
                control={control}
                rules={{ validate: (value) => value !== null || 'Choose the counted location.' }}
                render={({ field }) => (
                  <LocationPicker
                    id="location"
                    warehouseId={warehouseId}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </FormField>
          </div>

          <fieldset className="grid gap-3">
            <legend className="mb-2 font-medium">Counted products</legend>
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
                    rules={{
                      validate: (value, values) =>
                        value === null
                          ? 'Choose a product.'
                          : values.lines.filter((l) => l.product_id === value).length === 1 ||
                            'Count each product only once.',
                    }}
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
                  label="Counted"
                  htmlFor={`line-${index}-counted`}
                  error={errors.lines?.[index]?.counted_quantity?.message}
                >
                  <Input
                    id={`line-${index}-counted`}
                    inputMode="decimal"
                    aria-invalid={errors.lines?.[index]?.counted_quantity ? true : undefined}
                    {...register(`lines.${index}.counted_quantity`, {
                      required: 'Enter the counted quantity (0 if none).',
                      pattern: {
                        value: QUANTITY_PATTERN,
                        message: 'Use a number with up to 3 decimals.',
                      },
                    })}
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

          <FormField
            label="Reason"
            htmlFor="note"
            error={errors.note?.message}
            hint="Required, e.g. Monthly count, Damaged in storage."
          >
            <Textarea
              id="note"
              rows={2}
              aria-invalid={errors.note ? true : undefined}
              {...register('note', {
                validate: (value) => value.trim() !== '' || 'Enter a reason.',
                maxLength: { value: 500, message: 'Use at most 500 characters.' },
              })}
            />
          </FormField>

          <div>
            <Button type="submit" disabled={warehouses.isPending}>
              Record adjustment
            </Button>
          </div>
        </form>
      </Panel>

      <ConfirmDialog
        open={toConfirm !== null}
        onOpenChange={(open) => !open && setToConfirm(null)}
        title="Record this adjustment?"
        description="Stock at the location is corrected to the counted quantities. This cannot be undone."
        confirmLabel="Record adjustment"
        onConfirm={() => save(toConfirm!)}
      />
    </div>
  )
}

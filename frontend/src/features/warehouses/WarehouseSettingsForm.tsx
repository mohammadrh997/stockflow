import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { applyFieldErrors } from '@/api/errors'
import { ErrorMessage } from '@/components/ErrorMessage'
import { FormField } from '@/components/FormField'
import { LocationPicker } from '@/components/LocationPicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUpdateWarehouse, type Warehouse } from './queries'

type Values = { name: string; default_location_id: number | null }

export function WarehouseSettingsForm({ warehouse }: { warehouse: Warehouse }) {
  const updateWarehouse = useUpdateWarehouse(warehouse.id)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: { name: warehouse.name, default_location_id: warehouse.default_location_id },
  })

  async function submit(values: Values) {
    setFormError(null)
    try {
      await updateWarehouse.mutateAsync({
        name: values.name,
        default_location_id: values.default_location_id ?? undefined,
      })
      toast.success('Warehouse saved')
    } catch (error) {
      const fields = ['name', 'default_location_id'] as const
      setFormError(applyFieldErrors(error, fields, setError).join(' ') || null)
    }
  }

  return (
    <form className="grid max-w-xl gap-4" onSubmit={handleSubmit(submit)} noValidate>
      {formError && <ErrorMessage message={formError} />}
      <fieldset disabled={isSubmitting} className="grid gap-4 sm:grid-cols-2">
        <FormField label="Name" htmlFor="warehouse-name" error={errors.name?.message}>
          <Input
            id="warehouse-name"
            aria-invalid={errors.name ? true : undefined}
            {...register('name', {
              required: 'Enter a name.',
              maxLength: { value: 200, message: 'Use at most 200 characters.' },
            })}
          />
        </FormField>
        <FormField
          label="Default location"
          htmlFor="default-location"
          error={errors.default_location_id?.message}
        >
          <Controller
            name="default_location_id"
            control={control}
            render={({ field }) => (
              <LocationPicker
                id="default-location"
                warehouseId={warehouse.id}
                value={field.value}
                onChange={field.onChange}
              />
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

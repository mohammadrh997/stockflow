import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { applyFieldErrors } from '@/api/errors'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCreateLocation } from './queries'

type Values = { name: string }

export function AddLocationForm({ warehouseId }: { warehouseId: number }) {
  const createLocation = useCreateLocation()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ defaultValues: { name: '' } })

  async function submit(values: Values) {
    setFormError(null)
    try {
      const location = await createLocation.mutateAsync({
        name: values.name,
        warehouse_id: warehouseId,
      })
      toast.success(`Added ${location.name}`)
      reset()
    } catch (error) {
      setFormError(applyFieldErrors(error, ['name'], setError).join(' ') || null)
    }
  }

  return (
    <form className="grid max-w-xl gap-2" onSubmit={handleSubmit(submit)} noValidate>
      <div className="flex gap-2">
        <Input
          aria-label="New location name"
          placeholder="New location name, e.g. Shelf A"
          aria-invalid={errors.name ? true : undefined}
          disabled={isSubmitting}
          {...register('name', {
            required: 'Enter a name.',
            maxLength: { value: 200, message: 'Use at most 200 characters.' },
          })}
        />
        <Button type="submit" variant="outline" disabled={isSubmitting}>
          {isSubmitting ? 'Adding…' : 'Add location'}
        </Button>
      </div>
      {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      {formError && <ErrorMessage message={formError} />}
    </form>
  )
}

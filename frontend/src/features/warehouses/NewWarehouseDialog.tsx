import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { applyFieldErrors } from '@/api/errors'
import { ErrorMessage } from '@/components/ErrorMessage'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useCreateWarehouse } from './queries'

type Values = { name: string; code: string }

export function NewWarehouseDialog() {
  const navigate = useNavigate()
  const createWarehouse = useCreateWarehouse()
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ defaultValues: { name: '', code: '' } })

  function handleOpenChange(next: boolean) {
    setOpen(next)
    reset()
    setFormError(null)
  }

  async function submit(values: Values) {
    setFormError(null)
    try {
      const warehouse = await createWarehouse.mutateAsync(values)
      toast.success(`Created ${warehouse.name}`)
      setOpen(false)
      navigate(`/warehouses/${warehouse.id}`)
    } catch (error) {
      setFormError(applyFieldErrors(error, ['name', 'code'], setError).join(' ') || null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          New warehouse
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form className="grid gap-4" onSubmit={handleSubmit(submit)} noValidate>
          <DialogHeader>
            <DialogTitle>New warehouse</DialogTitle>
            <DialogDescription>
              A "Stock" location is created with it and used as its default.
            </DialogDescription>
          </DialogHeader>
          {formError && <ErrorMessage message={formError} />}
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
            label="Code"
            htmlFor="warehouse-code"
            error={errors.code?.message}
            hint="Short and unique, e.g. WH2. Used in transfer references."
          >
            <Input
              id="warehouse-code"
              className="uppercase"
              aria-invalid={errors.code ? true : undefined}
              {...register('code', {
                required: 'Enter a code.',
                maxLength: { value: 10, message: 'Use at most 10 characters.' },
              })}
            />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create warehouse'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

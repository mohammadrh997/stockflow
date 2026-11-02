import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { applyFieldErrors } from '@/api/errors'
import { ErrorMessage } from '@/components/ErrorMessage'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useRenameLocation, type Location } from './queries'

type Values = { name: string }

export function RenameLocationDialog({ location }: { location: Location }) {
  const renameLocation = useRenameLocation(location.id)
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ defaultValues: { name: location.name } })

  function handleOpenChange(next: boolean) {
    setOpen(next)
    reset({ name: location.name })
    setFormError(null)
  }

  async function submit(values: Values) {
    setFormError(null)
    try {
      await renameLocation.mutateAsync(values.name)
      toast.success(`Renamed to ${values.name}`)
      setOpen(false)
    } catch (error) {
      setFormError(applyFieldErrors(error, ['name'], setError).join(' ') || null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Rename
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form className="grid gap-4" onSubmit={handleSubmit(submit)} noValidate>
          <DialogHeader>
            <DialogTitle>Rename {location.name}</DialogTitle>
          </DialogHeader>
          {formError && <ErrorMessage message={formError} />}
          <FormField
            label="Name"
            htmlFor={`location-name-${location.id}`}
            error={errors.name?.message}
          >
            <Input
              id={`location-name-${location.id}`}
              aria-invalid={errors.name ? true : undefined}
              {...register('name', {
                required: 'Enter a name.',
                maxLength: { value: 200, message: 'Use at most 200 characters.' },
              })}
            />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

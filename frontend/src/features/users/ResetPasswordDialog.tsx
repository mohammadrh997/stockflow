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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useResetPassword, type User } from './queries'

type Values = { new_password: string }

export function ResetPasswordDialog({ user }: { user: User }) {
  const resetPassword = useResetPassword(user.id)
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ defaultValues: { new_password: '' } })

  function handleOpenChange(next: boolean) {
    setOpen(next)
    reset()
    setFormError(null)
  }

  async function submit(values: Values) {
    setFormError(null)
    try {
      await resetPassword.mutateAsync(values.new_password)
      toast.success(`Password reset for ${user.name}`)
      handleOpenChange(false)
    } catch (error) {
      setFormError(applyFieldErrors(error, ['new_password'], setError).join(' ') || null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">Reset password</Button>
      </DialogTrigger>
      <DialogContent>
        <form className="grid gap-4" onSubmit={handleSubmit(submit)} noValidate>
          <DialogHeader>
            <DialogTitle>Reset password for {user.name}</DialogTitle>
            <DialogDescription>
              Their current sessions end and they log in with the new password.
            </DialogDescription>
          </DialogHeader>
          {formError && <ErrorMessage message={formError} />}
          <FormField
            label="New password"
            htmlFor="new-password"
            error={errors.new_password?.message}
          >
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={errors.new_password ? true : undefined}
              {...register('new_password', {
                required: 'Enter a password.',
                minLength: { value: 8, message: 'Use at least 8 characters.' },
                maxLength: { value: 128, message: 'Use at most 128 characters.' },
              })}
            />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Resetting…' : 'Reset password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { ApiError, applyFieldErrors } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { ErrorMessage } from '@/components/ErrorMessage'
import { FormField } from '@/components/FormField'
import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AccessSummary } from '@/features/users/AccessSummary'
import { useChangePassword, useUpdateProfile } from './queries'

function NameForm({ name }: { name: string }) {
  const updateProfile = useUpdateProfile()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ name: string }>({ defaultValues: { name } })

  async function submit(values: { name: string }) {
    setFormError(null)
    try {
      await updateProfile.mutateAsync(values.name)
      toast.success('Name saved')
    } catch (error) {
      setFormError(applyFieldErrors(error, ['name'], setError).join(' ') || null)
    }
  }

  return (
    <form className="grid max-w-sm gap-4" onSubmit={handleSubmit(submit)} noValidate>
      {formError && <ErrorMessage message={formError} />}
      <FormField label="Name" htmlFor="profile-name" error={errors.name?.message}>
        <Input
          id="profile-name"
          disabled={isSubmitting}
          aria-invalid={errors.name ? true : undefined}
          {...register('name', {
            required: 'Enter your name.',
            maxLength: { value: 30, message: 'Use at most 30 characters.' },
          })}
        />
      </FormField>
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save name'}
        </Button>
      </div>
    </form>
  )
}

type PasswordValues = { current_password: string; new_password: string; confirm: string }

function PasswordForm() {
  const changePassword = useChangePassword()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({
    defaultValues: { current_password: '', new_password: '', confirm: '' },
  })

  async function submit(values: PasswordValues) {
    setFormError(null)
    try {
      await changePassword.mutateAsync({
        current_password: values.current_password,
        new_password: values.new_password,
      })
      reset()
      toast.success('Password changed')
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        setError('current_password', { type: 'server', message: errorDetail(error) })
        return
      }
      const fields = ['current_password', 'new_password'] as const
      setFormError(applyFieldErrors(error, fields, setError).join(' ') || null)
    }
  }

  return (
    <form className="grid max-w-sm gap-4" onSubmit={handleSubmit(submit)} noValidate>
      {formError && <ErrorMessage message={formError} />}
      <fieldset disabled={isSubmitting} className="grid gap-4">
        <FormField
          label="Current password"
          htmlFor="current-password"
          error={errors.current_password?.message}
        >
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            aria-invalid={errors.current_password ? true : undefined}
            {...register('current_password', { required: 'Enter your current password.' })}
          />
        </FormField>
        <FormField label="New password" htmlFor="new-password" error={errors.new_password?.message}>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={errors.new_password ? true : undefined}
            {...register('new_password', {
              required: 'Enter a new password.',
              minLength: { value: 8, message: 'Use at least 8 characters.' },
              maxLength: { value: 128, message: 'Use at most 128 characters.' },
              validate: (value, values) =>
                value !== values.current_password || 'Choose a different password.',
            })}
          />
        </FormField>
        <FormField
          label="Repeat new password"
          htmlFor="confirm-password"
          error={errors.confirm?.message}
        >
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={errors.confirm ? true : undefined}
            {...register('confirm', {
              validate: (value, values) =>
                value === values.new_password || 'The passwords do not match.',
            })}
          />
        </FormField>
      </fieldset>
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Changing…' : 'Change password'}
        </Button>
      </div>
    </form>
  )
}

function errorDetail(error: ApiError): string {
  return typeof error.detail === 'string' ? error.detail : 'Current password is incorrect.'
}

export function ProfilePage() {
  const { user } = useAuth()
  if (!user) return null

  return (
    <div className="grid gap-8">
      <PageHeader title="Profile" />
      <Panel className="grid gap-3">
        <dl className="grid max-w-xl grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Email</dt>
          <dd>{user.email}</dd>
          <dt className="text-muted-foreground">Access</dt>
          <dd>
            <AccessSummary user={user} />
          </dd>
        </dl>
        <p className="text-sm text-muted-foreground">
          Ask an administrator to change your email or access.
        </p>
      </Panel>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Panel className="grid gap-3">
          <h2 className="text-lg font-semibold">Name</h2>
          <NameForm key={user.name} name={user.name} />
        </Panel>
        <Panel className="grid gap-3">
          <h2 className="text-lg font-semibold">Password</h2>
          <PasswordForm />
        </Panel>
      </div>
    </div>
  )
}

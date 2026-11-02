import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'

import { applyFieldErrors } from '@/api/errors'
import { DisabledReason } from '@/components/DisabledReason'
import { ErrorMessage } from '@/components/ErrorMessage'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ACCESS_LEVELS, type AccessLevel } from './queries'

export type UserFormValues = {
  email: string
  name: string
  password: string
  is_admin: boolean
  sales_access: AccessLevel
  purchase_access: AccessLevel
  inventory_access: AccessLevel
}

const FIELDS = [
  'email',
  'name',
  'password',
  'is_admin',
  'sales_access',
  'purchase_access',
  'inventory_access',
] as const

const MODULES = [
  { name: 'sales_access', label: 'Sales' },
  { name: 'purchase_access', label: 'Purchase' },
  { name: 'inventory_access', label: 'Inventory' },
] as const

const EMPTY: UserFormValues = {
  email: '',
  name: '',
  password: '',
  is_admin: false,
  sales_access: 'none',
  purchase_access: 'none',
  inventory_access: 'none',
}

type Props = {
  defaultValues?: UserFormValues
  // New users need a password; existing ones get theirs reset separately.
  withPassword?: boolean
  // Admins can't remove their own admin flag.
  isSelf?: boolean
  submitLabel: string
  onSubmit: (values: UserFormValues) => Promise<unknown>
}

export function UserForm({
  defaultValues = EMPTY,
  withPassword,
  isSelf,
  submitLabel,
  onSubmit,
}: Props) {
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({ defaultValues })
  const isAdmin = useWatch({ control, name: 'is_admin' })

  async function submit(values: UserFormValues) {
    setFormError(null)
    try {
      await onSubmit(values)
    } catch (error) {
      setFormError(applyFieldErrors(error, FIELDS, setError).join(' ') || null)
    }
  }

  return (
    <form className="grid max-w-xl gap-4" onSubmit={handleSubmit(submit)} noValidate>
      {formError && <ErrorMessage message={formError} />}
      <fieldset disabled={isSubmitting} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Name" htmlFor="name" error={errors.name?.message}>
            <Input
              id="name"
              aria-invalid={errors.name ? true : undefined}
              {...register('name', {
                required: 'Enter a name.',
                maxLength: { value: 30, message: 'Use at most 30 characters.' },
              })}
            />
          </FormField>
          <FormField label="Email" htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="off"
              aria-invalid={errors.email ? true : undefined}
              {...register('email', { required: 'Enter an email.' })}
            />
          </FormField>
        </div>
        {withPassword && (
          <FormField
            label="Password"
            htmlFor="password"
            error={errors.password?.message}
            hint="At least 8 characters. Share it with the user securely."
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={errors.password ? true : undefined}
              {...register('password', {
                required: 'Enter a password.',
                minLength: { value: 8, message: 'Use at least 8 characters.' },
                maxLength: { value: 128, message: 'Use at most 128 characters.' },
              })}
            />
          </FormField>
        )}
        <Controller
          name="is_admin"
          control={control}
          render={({ field }) => (
            <DisabledReason reason={isSelf ? "You can't remove your own admin access." : null}>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_admin"
                  checked={field.value}
                  disabled={isSelf}
                  onCheckedChange={(state) => field.onChange(state === true)}
                />
                <Label htmlFor="is_admin">Administrator</Label>
              </div>
            </DisabledReason>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {MODULES.map((module) => (
            <FormField
              key={module.name}
              label={module.label}
              htmlFor={module.name}
              error={errors[module.name]?.message}
            >
              <Controller
                name={module.name}
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id={module.name} className="w-full capitalize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCESS_LEVELS.map((level) => (
                        <SelectItem key={level} value={level} className="capitalize">
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
          ))}
        </div>
        {isAdmin && (
          <p className="text-sm text-muted-foreground">
            Administrators can do everything, whatever their module access.
          </p>
        )}
      </fieldset>
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}

import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { applyFieldErrors } from '@/api/errors'
import { ErrorMessage } from '@/components/ErrorMessage'
import { FormField } from '@/components/FormField'
import { SaveBar } from '@/components/SaveBar'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { parentChoices } from './categoryTree'
import { useUpdateCategory, type Category } from './queries'

const TOP = 'top'

type Values = { name: string; parent: string }

type Props = {
  category: Category
  // The active tree, for the places it can move to.
  categories: Category[]
  readOnly: boolean
}

// A category's name and where it sits; moving it takes its subcategories along.
export function CategoryDetailsForm({ category, categories, readOnly }: Props) {
  const update = useUpdateCategory(category.id)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({
    defaultValues: {
      name: category.name,
      parent: category.parent_id === null ? TOP : String(category.parent_id),
    },
  })
  const choices = parentChoices(categories, category)

  async function submit(values: Values) {
    setFormError(null)
    const parent_id = values.parent === TOP ? null : Number(values.parent)
    try {
      // An unchanged parent isn't sent, so it can't be refused.
      await update.mutateAsync({
        name: values.name.trim(),
        ...(parent_id !== category.parent_id && { parent_id }),
      })
      reset(values) // what was saved is the new starting point
      toast.success('Category saved')
    } catch (error) {
      setFormError(applyFieldErrors(error, ['name'], setError).join(' ') || null)
    }
  }

  return (
    <form className="grid max-w-xl gap-4" onSubmit={handleSubmit(submit)} noValidate>
      {formError && <ErrorMessage message={formError} />}
      <fieldset disabled={readOnly || isSubmitting} className="grid gap-4">
        <FormField label="Name" htmlFor="category-name" error={errors.name?.message}>
          <Input
            id="category-name"
            aria-invalid={errors.name ? true : undefined}
            {...register('name', {
              validate: (value) => value.trim() !== '' || 'Enter a name.',
              maxLength: { value: 100, message: 'Use at most 100 characters.' },
            })}
          />
        </FormField>
        <FormField
          label="Parent category"
          htmlFor="category-parent"
          hint="Its subcategories move along with it."
        >
          <Controller
            name="parent"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                <SelectTrigger id="category-parent" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TOP}>None (top level)</SelectItem>
                  {choices.map((choice) => (
                    <SelectItem key={choice.id} value={String(choice.id)}>
                      {choice.path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
      </fieldset>
      {!readOnly && (
        <SaveBar
          label="Save changes"
          isSubmitting={isSubmitting}
          isDirty={isDirty}
          onDiscard={() => reset()}
        />
      )}
    </form>
  )
}

import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
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
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { parentChoices } from './categoryTree'
import { useCreateCategory, useUpdateCategory, type Category } from './queries'

const TOP = 'top'

type Values = { name: string; parent: string }

type Props = {
  categories: Category[]
  // Editing this category; without it, a new one is added.
  category?: Category
  // For a new one: where it starts (a row's "Add subcategory").
  parentId?: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

// The dialog stays mounted while closed; the form inside starts fresh on every opening.
export function CategoryDialog({ open, onOpenChange, ...props }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && <CategoryForm {...props} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function CategoryForm({
  categories,
  category,
  parentId = null,
  onDone,
}: Omit<Props, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const create = useCreateCategory()
  const update = useUpdateCategory(category?.id ?? 0)
  const [formError, setFormError] = useState<string | null>(null)
  const startParent = category ? category.parent_id : parentId
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: {
      name: category?.name ?? '',
      parent: startParent === null ? TOP : String(startParent),
    },
  })
  const choices = parentChoices(categories, category)

  async function submit(values: Values) {
    setFormError(null)
    const name = values.name.trim()
    const parent_id = values.parent === TOP ? null : Number(values.parent)
    try {
      if (category) {
        // Only what changed: an unchanged parent isn't sent, so it can't be refused.
        await update.mutateAsync({
          name,
          ...(parent_id !== category.parent_id && { parent_id }),
        })
        toast.success('Category saved')
      } else {
        await create.mutateAsync({ name, parent_id })
        toast.success(`Added ${name}`)
      }
      onDone()
    } catch (error) {
      setFormError(applyFieldErrors(error, ['name'], setError).join(' ') || null)
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(submit)} noValidate>
      <DialogHeader>
        <DialogTitle>{category ? `Edit ${category.name}` : 'New category'}</DialogTitle>
      </DialogHeader>
      {formError && <ErrorMessage message={formError} />}
      <FormField label="Name" htmlFor="category-name" error={errors.name?.message}>
        <Input
          id="category-name"
          autoFocus
          aria-invalid={errors.name ? true : undefined}
          {...register('name', {
            validate: (value) => value.trim() !== '' || 'Enter a name.',
            maxLength: { value: 100, message: 'Use at most 100 characters.' },
          })}
        />
      </FormField>
      <FormField label="Parent category" htmlFor="category-parent">
        <Controller
          name="parent"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
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
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : category ? 'Save' : 'Add category'}
        </Button>
      </DialogFooter>
    </form>
  )
}

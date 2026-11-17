import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { ApiError, errorMessage } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Props = {
  // Names the field for screen readers, e.g. "Supplier reference".
  label: string
  value: string | null
  placeholder?: string
  maxLength?: number
  // Saves the trimmed text, or null for an emptied field.
  onSave: (value: string | null) => Promise<unknown>
}

// A short text edited where it's shown, in a details list. Save and Discard appear only
// once it has changed. A 409 from the server is shown as it is: it says what's in the way.
// Remount it (a `key`) with what the server saved.
export function InlineTextField({ label, value, placeholder, maxLength = 100, onSave }: Props) {
  const [problem, setProblem] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { isDirty, isSubmitting },
  } = useForm<{ text: string }>({ defaultValues: { text: value ?? '' } })

  async function submit(values: { text: string }) {
    setProblem(null)
    try {
      await onSave(values.text.trim() || null)
      reset(values)
    } catch (error) {
      setProblem(
        error instanceof ApiError && error.status === 409
          ? String(error.detail)
          : errorMessage(error),
      )
    }
  }

  return (
    <form className="grid gap-1" onSubmit={handleSubmit(submit)} noValidate>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={label}
          className="h-8 w-48"
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={isSubmitting}
          aria-invalid={problem ? true : undefined}
          {...register('text')}
        />
        {isDirty && (
          <>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isSubmitting}
              onClick={() => {
                reset()
                setProblem(null)
              }}
            >
              Discard
            </Button>
          </>
        )}
      </div>
      {problem && <p className="text-sm text-destructive">{problem}</p>}
    </form>
  )
}

import { useState, type KeyboardEvent } from 'react'

import { errorMessage } from '@/api/errors'
import { Input } from '@/components/ui/input'
import { useProduct } from '@/features/products/queries'
import { cn } from '@/lib/utils'

type Props = {
  productId: number
  field: 'Quantity' | 'Unit price'
  value: string
  format: (value: string) => string
  // Returns an error message, or null when the text is acceptable.
  validate: (text: string) => string | null
  onSave: (text: string) => Promise<unknown>
}

// A quantity or price edited in place: Enter or leaving the field saves, Escape undoes.
// The table remounts it with the server's value after a save.
export function LineField({ productId, field, value, format, validate, onSave }: Props) {
  const product = useProduct(productId)
  const [text, setText] = useState(() => format(value))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    const next = text.trim()
    if (next !== '' && Number(next) === Number(value)) {
      setText(format(value))
      setError(null)
      return
    }
    const problem = validate(next)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(next)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget.blur()
    }
    if (event.key === 'Escape') {
      setText(format(value))
      setError(null)
    }
  }

  return (
    <div className="ml-auto grid w-24 justify-items-end gap-1">
      <Input
        aria-label={`${field} for ${product.data?.name ?? 'this line'}`}
        aria-invalid={error ? true : undefined}
        inputMode="decimal"
        disabled={saving}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        className={cn('h-8 text-right tabular-nums', saving && 'opacity-60')}
      />
      {error && <span className="text-right text-xs text-destructive">{error}</span>}
    </div>
  )
}

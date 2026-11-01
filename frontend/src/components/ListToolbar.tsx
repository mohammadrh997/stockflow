import { Search } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDebouncedValue } from '@/lib/useListParams'

type SearchProps = {
  value: string
  onChange: (value: string) => void
  placeholder: string
}

// Typing stays responsive; the URL (and so the query) updates once typing pauses.
export function SearchInput({ value, onChange, placeholder }: SearchProps) {
  const [text, setText] = useState(value)
  const debounced = useDebouncedValue(text)

  useEffect(() => {
    if (debounced.trim() !== value) onChange(debounced.trim())
  }, [debounced, value, onChange])

  return (
    <div className="relative w-full sm:w-64">
      <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        className="pl-8"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
    </div>
  )
}

type ArchivedToggleProps = {
  checked: boolean
  onChange: (checked: boolean) => void
}

export function ShowArchivedToggle({ checked, onChange }: ArchivedToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id="show-archived"
        checked={checked}
        onCheckedChange={(state) => onChange(state === true)}
      />
      <Label htmlFor="show-archived">Show archived</Label>
    </div>
  )
}

export function ListToolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-4">{children}</div>
}

import { Check, ChevronsUpDown, X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useCategories } from './queries'

type Props = {
  id?: string
  value: number | null
  onChange: (categoryId: number | null) => void
  // Shown when nothing is chosen: "No category" on a product, "All categories" in a filter.
  placeholder: string
  disabled?: boolean
  className?: string
}

// Searchable by the whole path, so "chair" finds "Furniture / Chairs / Office" too.
export function CategoryPicker({ id, value, onChange, placeholder, disabled, className }: Props) {
  const [open, setOpen] = useState(false)
  // Archived ones too, so a product still in an archived category shows its name;
  // only active ones are offered.
  const categories = useCategories(true)
  const selected = categories.data?.find((category) => category.id === value)
  const label =
    value === null
      ? placeholder
      : selected
        ? `${selected.path}${selected.is_active ? '' : ' (archived)'}`
        : `Category #${value}`

  return (
    <div className={cn('flex w-full items-center gap-1 sm:w-72', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="min-w-0 flex-1 justify-between font-normal"
          >
            <span className={cn('truncate', value === null && 'text-muted-foreground')}>
              {label}
            </span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search categories…" />
            <CommandList>
              <CommandEmpty>
                {categories.isError
                  ? 'Could not load categories. Try again.'
                  : categories.isPending
                    ? 'Loading…'
                    : 'No categories found.'}
              </CommandEmpty>
              {categories.data
                ?.filter((category) => category.is_active)
                .map((category) => (
                  <CommandItem
                    key={category.id}
                    // cmdk searches this text; the id keeps equal paths apart.
                    value={`${category.path} #${category.id}`}
                    onSelect={() => {
                      onChange(category.id)
                      setOpen(false)
                    }}
                  >
                    <Check className={cn(category.id === value ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{category.path}</span>
                  </CommandItem>
                ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value !== null && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Clear category"
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          <X />
        </Button>
      )}
    </div>
  )
}

// A category's full path, from the cached tree.
export function CategoryName({ id }: { id: number | null }) {
  const categories = useCategories(true)
  if (id === null) return <span className="text-muted-foreground">—</span>
  const category = categories.data?.find((c) => c.id === id)
  return <>{category?.path ?? `Category #${id}`}</>
}

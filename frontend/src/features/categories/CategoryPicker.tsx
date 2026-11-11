import { Check, ChevronsUpDown, Plus, X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { errorMessage } from '@/api/errors'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { normalizePath, planNewCategory } from './categoryTree'
import { useCategories, useCreateCategory } from './queries'

type Props = {
  id?: string
  value: number | null
  onChange: (categoryId: number | null) => void
  // Shown when nothing is chosen: "No category" on a product, "All categories" in a filter.
  placeholder: string
  disabled?: boolean
  className?: string
  // For a picker without a visible label, such as a list filter.
  'aria-label'?: string
  // Offers "Create …" for what was typed (on a product form, for inventory managers).
  allowCreate?: boolean
}

// Searchable by the whole path, so "chair" finds "Furniture / Chairs / Office" too.
export function CategoryPicker({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  className,
  'aria-label': ariaLabel,
  allowCreate,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const create = useCreateCategory()
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

  // Matched on the whole path, with "a/b" read as "a / b".
  const query = normalizePath(search).toLowerCase()
  const matches = (categories.data ?? []).filter(
    (category) => category.is_active && category.path.toLowerCase().includes(query),
  )
  const plan = allowCreate && categories.data ? planNewCategory(categories.data, search) : null

  function openChange(next: boolean) {
    setOpen(next)
    if (!next) setSearch('')
  }

  async function createTyped(name: string, parentId: number | null) {
    setProblem(null)
    openChange(false)
    try {
      const created = await create.mutateAsync({ name, parent_id: parentId })
      onChange(created.id)
    } catch (error) {
      // The server says why ("there is already a category named … here").
      setProblem(errorMessage(error))
    }
  }

  return (
    <div className={cn('grid w-full gap-1 sm:w-72', className)}>
      <div className="flex items-center gap-1">
        <Popover open={open} onOpenChange={openChange}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              variant="outline"
              role="combobox"
              aria-label={ariaLabel}
              aria-expanded={open}
              disabled={disabled || create.isPending}
              className="min-w-0 flex-1 justify-between font-normal"
            >
              <span className={cn('truncate', value === null && 'text-muted-foreground')}>
                {create.isPending ? 'Creating…' : label}
              </span>
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder={allowCreate ? 'Search, or type a new name…' : 'Search categories…'}
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty>
                  {categories.isError
                    ? 'Could not load categories. Try again.'
                    : categories.isPending
                      ? 'Loading…'
                      : 'No categories found.'}
                </CommandEmpty>
                {matches.map((category) => (
                  <CommandItem
                    key={category.id}
                    value={String(category.id)}
                    onSelect={() => {
                      onChange(category.id)
                      setOpen(false)
                    }}
                  >
                    <Check className={cn(category.id === value ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{category.path}</span>
                  </CommandItem>
                ))}
                {plan && 'name' in plan && (
                  <CommandItem
                    value="create"
                    onSelect={() => void createTyped(plan.name, plan.parent?.id ?? null)}
                  >
                    <Plus />
                    <span className="truncate">
                      Create “{plan.name}”{plan.parent && ` under ${plan.parent.path}`}
                    </span>
                  </CommandItem>
                )}
                {plan && 'problem' in plan && (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">{plan.problem}</p>
                )}
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
      {problem && <p className="text-sm text-destructive">{problem}</p>}
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

import { Check, ChevronsUpDown, Plus, X } from 'lucide-react'
import { useState, type Ref } from 'react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useProduct, useProducts } from '@/features/products/queries'
import { useDebouncedValue } from '@/lib/useListParams'
import { cn } from '@/lib/utils'

const RESULT_LIMIT = 20

type Props = {
  id?: string
  // Lets a form move focus to the picker (react-hook-form's setFocus).
  buttonRef?: Ref<HTMLButtonElement>
  value: number | null
  onChange: (productId: number | null) => void
  placeholder?: string
  clearable?: boolean
  disabled?: boolean
  className?: string
  // Offers "Create …" when nothing matches the search exactly.
  onCreate?: (name: string) => void
  // Shown with "No products found.", e.g. who to ask when the user cannot create one.
  emptyHint?: string
}

// Searches active products on the server by name.
export function ProductPicker({
  id,
  buttonRef,
  value,
  onChange,
  placeholder = 'Choose a product',
  clearable,
  disabled,
  className,
  onCreate,
  emptyHint,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const name = useDebouncedValue(search.trim())
  const products = useProducts(
    { name: name || undefined, skip: 0, limit: RESULT_LIMIT },
    { enabled: open },
  )
  const selected = useProduct(value ?? 0, { enabled: value !== null })
  const typed = search.trim()
  const settled = name === typed && !products.isFetching && !products.isError
  const exactMatch = products.data?.some((p) => p.name.toLowerCase() === typed.toLowerCase())
  const offerCreate = onCreate && typed !== '' && settled && !exactMatch

  const label =
    value === null ? placeholder : selected.data ? selected.data.name : `Product #${value}`

  return (
    <div className={cn('flex w-full items-center gap-1 sm:w-72', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={buttonRef}
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
        <PopoverContent className="w-72 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search products…" value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>
                {products.isError
                  ? 'Could not load products. Try again.'
                  : products.isPending
                    ? 'Searching…'
                    : ['No products found.', emptyHint].filter(Boolean).join(' ')}
              </CommandEmpty>
              {products.data?.map((product) => (
                <CommandItem
                  key={product.id}
                  value={String(product.id)}
                  onSelect={() => {
                    onChange(product.id)
                    setOpen(false)
                  }}
                >
                  <Check className={cn(product.id === value ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{product.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{product.sku}</span>
                </CommandItem>
              ))}
              {offerCreate && (
                <CommandItem
                  value="create"
                  onSelect={() => {
                    setOpen(false)
                    setSearch('')
                    onCreate(typed)
                  }}
                >
                  <Plus />
                  Create “{typed}”…
                </CommandItem>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {clearable && value !== null && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Clear product"
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          <X />
        </Button>
      )}
    </div>
  )
}

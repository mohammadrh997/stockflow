import { Check, ChevronsUpDown, X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { usePartner, usePartners } from '@/features/partners/queries'
import { useDebouncedValue } from '@/lib/useListParams'
import { cn } from '@/lib/utils'

const RESULT_LIMIT = 20

type Props = {
  id?: string
  role: 'customer' | 'supplier'
  value: number | null
  onChange: (partnerId: number | null) => void
  placeholder?: string
  clearable?: boolean
  disabled?: boolean
}

// Offers partners with the given role first; "Show all partners" lifts that filter.
export function PartnerPicker({
  id,
  role,
  value,
  onChange,
  placeholder = 'Choose a partner',
  clearable,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)
  const name = useDebouncedValue(search.trim())
  const partners = usePartners(
    {
      name: name || undefined,
      is_customer: role === 'customer' && !showAll ? true : undefined,
      is_supplier: role === 'supplier' && !showAll ? true : undefined,
      skip: 0,
      limit: RESULT_LIMIT,
    },
    { enabled: open },
  )
  const selected = usePartner(value ?? 0, { enabled: value !== null })

  const label =
    value === null ? placeholder : selected.data ? selected.data.name : `Partner #${value}`

  return (
    <div className="flex w-full items-center gap-1 sm:w-72">
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
        <PopoverContent className="w-72 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search partners…" value={search} onValueChange={setSearch} />
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Checkbox
                id={`${id ?? 'partner'}-show-all`}
                checked={showAll}
                onCheckedChange={(state) => setShowAll(state === true)}
              />
              <Label htmlFor={`${id ?? 'partner'}-show-all`} className="font-normal">
                Show all partners
              </Label>
            </div>
            <CommandList>
              <CommandEmpty>
                {partners.isPending ? 'Searching…' : 'No partners found.'}
              </CommandEmpty>
              {partners.data?.map((partner) => (
                <CommandItem
                  key={partner.id}
                  value={String(partner.id)}
                  onSelect={() => {
                    onChange(partner.id)
                    setOpen(false)
                  }}
                >
                  <Check className={cn(partner.id === value ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{partner.name}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {clearable && value !== null && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Clear partner"
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          <X />
        </Button>
      )}
    </div>
  )
}

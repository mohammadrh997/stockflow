import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useWarehouses } from '@/features/warehouses/queries'

const ALL = 'all'

type Props = {
  id?: string
  value: number | null
  onChange: (warehouseId: number | null) => void
  // When set, offers an "any warehouse" choice with this label.
  allLabel?: string
  disabled?: boolean
}

export function WarehousePicker({ id, value, onChange, allLabel, disabled }: Props) {
  const warehouses = useWarehouses()

  return (
    <Select
      value={value === null ? (allLabel ? ALL : '') : String(value)}
      onValueChange={(next) => onChange(next === ALL ? null : Number(next))}
      disabled={disabled || warehouses.isPending}
    >
      <SelectTrigger id={id} className="w-full sm:w-56">
        <SelectValue
          placeholder={warehouses.isError ? 'Could not load warehouses' : 'Choose a warehouse'}
        />
      </SelectTrigger>
      <SelectContent>
        {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
        {warehouses.data?.map((warehouse) => (
          <SelectItem key={warehouse.id} value={String(warehouse.id)}>
            {warehouse.name} ({warehouse.code})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

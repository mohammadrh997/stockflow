import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLocations } from '@/features/warehouses/queries'

const NONE = 'none'

type Props = {
  id?: string
  warehouseId: number | undefined
  value: number | null
  onChange: (locationId: number | null) => void
  // When set, offers a "no location" choice with this label (e.g. "Automatic").
  emptyLabel?: string
  excludeId?: number
  disabled?: boolean
}

// Only active internal locations of the warehouse: virtual and archived ones are never offered.
export function LocationPicker({
  id,
  warehouseId,
  value,
  onChange,
  emptyLabel,
  excludeId,
  disabled,
}: Props) {
  const locations = useLocations(
    { warehouse_id: warehouseId, location_type: 'internal' },
    { enabled: warehouseId !== undefined },
  )
  const options = (locations.data ?? []).filter((location) => location.id !== excludeId)

  return (
    <Select
      value={value === null ? (emptyLabel ? NONE : '') : String(value)}
      onValueChange={(next) => onChange(next === NONE ? null : Number(next))}
      disabled={disabled || warehouseId === undefined || locations.isPending}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue
          placeholder={
            locations.isError
              ? 'Could not load locations'
              : locations.isPending
                ? 'Loading…'
                : 'Choose a location'
          }
        />
      </SelectTrigger>
      <SelectContent>
        {emptyLabel && <SelectItem value={NONE}>{emptyLabel}</SelectItem>}
        {options.map((location) => (
          <SelectItem key={location.id} value={String(location.id)}>
            {location.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

import { formatQuantity } from '@/lib/format'

export function Quantity({ value }: { value: string }) {
  return <span className="tabular-nums">{formatQuantity(value)}</span>
}

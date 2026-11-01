import { formatMoney } from '@/lib/format'

export function Money({ value }: { value: string }) {
  return <span className="tabular-nums">{formatMoney(value)}</span>
}

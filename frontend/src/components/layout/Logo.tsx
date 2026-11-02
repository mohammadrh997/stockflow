import { Layers } from 'lucide-react'

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Layers className="size-4" />
      </span>
      StockFlow
    </span>
  )
}

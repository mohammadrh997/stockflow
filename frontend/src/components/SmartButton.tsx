import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Skeleton } from '@/components/ui/skeleton'

// The look of the shortcut buttons above a record (a product's stock, a partner's orders...).
export const SMART_BUTTON =
  'flex min-w-36 items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/60'

type Props = {
  icon: LucideIcon
  value: ReactNode
  label: string
  detail?: ReactNode
}

// What goes inside one: an icon, a figure with its label, and a smaller line under it.
export function SmartButtonFace({ icon: Icon, value, label, detail }: Props) {
  return (
    <>
      <Icon className="size-5 shrink-0 text-primary" />
      <span className="grid leading-tight">
        <span className="text-sm">
          <span className="font-semibold tabular-nums">{value}</span> {label}
        </span>
        {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
      </span>
    </>
  )
}

export function SmartButtonLoading({ wide = false }: { wide?: boolean }) {
  return <Skeleton className={wide ? 'inline-block h-4 w-16' : 'inline-block h-4 w-6'} />
}

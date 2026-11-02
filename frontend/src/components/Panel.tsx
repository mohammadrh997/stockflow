import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

// A white surface on the tinted page background, for forms and detail blocks.
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border bg-card p-4 shadow-xs sm:p-6', className)}>
      {children}
    </div>
  )
}

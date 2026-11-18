import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type Props = {
  title: string
  icon: LucideIcon
  to: string
  rows: unknown[] | undefined
  isPending: boolean
  isError: boolean
  // The page size the rows were asked for: a full page means "at least this many".
  limit?: number
  detail?: ReactNode
}

export function AttentionCard({
  title,
  icon: Icon,
  to,
  rows,
  isPending,
  isError,
  limit,
  detail,
}: Props) {
  const count = rows?.length ?? 0
  const label = limit !== undefined && count >= limit ? `${limit}+` : String(count)

  // Nothing waiting: one quiet full-width line, after the cards that need someone (grid
  // order), so the eye goes to the work and the all-clear ones read as a short list.
  if (!isPending && !isError && count === 0) {
    return (
      <Link
        to={to}
        className="order-last col-span-full flex items-center gap-2 rounded-lg border border-dashed px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {/* Heard, not seen: keeps the two from running together for screen readers. */}
        <span className="sr-only">,</span>
        <span>None</span>
      </Link>
    )
  }

  return (
    <Link to={to} className="group">
      <Card className="h-full transition-colors group-hover:bg-muted/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Icon className="size-4" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1">
          {isPending ? (
            <Skeleton className="h-9 w-12" />
          ) : isError ? (
            <span className="text-sm text-destructive">Could not load</span>
          ) : (
            <>
              <span className={cn('text-3xl font-semibold tabular-nums')}>{label}</span>
              {detail}
            </>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

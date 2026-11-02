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
  // Lists have no total count: a full page means "at least this many".
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
              <span
                className={cn(
                  'text-3xl font-semibold tabular-nums',
                  count === 0 && 'text-muted-foreground',
                )}
              >
                {label}
              </span>
              {count === 0 ? (
                <span className="text-sm text-muted-foreground">Nothing waiting</span>
              ) : (
                detail
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

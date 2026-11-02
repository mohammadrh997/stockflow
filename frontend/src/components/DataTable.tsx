import type { MouseEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router'

import { ErrorMessage } from '@/components/ErrorMessage'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export type Column<T> = {
  header: string
  cell: (row: T) => ReactNode
  className?: string
}

type Props<T> = {
  columns: Column<T>[]
  rows: T[] | undefined
  rowKey: (row: T) => string | number
  // Makes the whole row open this link; the links and buttons inside it keep working.
  rowHref?: (row: T) => string
  isPending: boolean
  error: unknown
  onRetry?: () => void
  emptyMessage: string
  // Shown under the empty message, e.g. a button to create the first record.
  emptyAction?: ReactNode
}

const LOADING_ROWS = 5

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  isPending,
  error,
  onRetry,
  emptyMessage,
  emptyAction,
}: Props<T>) {
  const navigate = useNavigate()

  function openRow(event: MouseEvent, href: string) {
    if ((event.target as HTMLElement).closest('a, button, input, [role="checkbox"]')) return
    if (event.ctrlKey || event.metaKey) window.open(href, '_blank')
    else navigate(href)
  }

  if (error) return <ErrorMessage error={error} onRetry={onRetry} />

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.header} className={column.className}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending &&
            Array.from({ length: LOADING_ROWS }, (_, index) => (
              <TableRow key={index}>
                {columns.map((column) => (
                  <TableCell key={column.header}>
                    <Skeleton className="h-4 w-full max-w-32" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {!isPending && rows?.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="py-8 text-center text-muted-foreground"
              >
                <div className="grid justify-items-center gap-3">
                  {emptyMessage}
                  {emptyAction}
                </div>
              </TableCell>
            </TableRow>
          )}
          {rows?.map((row) => (
            <TableRow
              key={rowKey(row)}
              className={rowHref && 'cursor-pointer'}
              onClick={rowHref && ((event) => openRow(event, rowHref(row)))}
            >
              {columns.map((column) => (
                <TableCell key={column.header} className={column.className}>
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

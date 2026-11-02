import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'

type Props = {
  page: number
  pageSize: number
  rowCount: number | undefined
  onPageChange: (page: number) => void
}

// The API returns no total, so a full page is the only hint that more rows exist.
export function Pagination({ page, pageSize, rowCount, onPageChange }: Props) {
  const hasNext = rowCount === pageSize
  if (page === 0 && !hasNext) return null

  return (
    <nav aria-label="Pagination" className="flex items-center justify-end gap-2">
      <span className="text-sm text-muted-foreground">Page {page + 1}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft />
        Previous
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!hasNext}
        onClick={() => onPageChange(page + 1)}
      >
        Next
        <ChevronRight />
      </Button>
    </nav>
  )
}

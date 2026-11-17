import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { fetchListPage, readListContext, type ListContext } from '@/lib/recordPager'

// "3 / 9" with previous and next, through the list the record was opened from. Nothing
// when it wasn't opened from a list.
export function RecordPager({ id }: { id: number }) {
  const location = useLocation()
  const navigate = useNavigate()
  const list = readListContext(location.state)
  const index = list ? list.ids.indexOf(id) : -1
  const [moving, setMoving] = useState(false)
  // How many there are in all: one row asked for, the total read from the header.
  const total = useQuery({
    queryKey: ['record-pager', list?.endpoint, list?.query],
    queryFn: async () => (await fetchListPage({ ...list!, limit: 1 }, 0)).total,
    enabled: index >= 0,
  })

  const position = list && index >= 0 ? list.skip + index + 1 : null
  const hasPrevious = position !== null && position > 1
  const hasNext =
    position !== null &&
    (total.data !== undefined
      ? position < total.data
      : index < list!.ids.length - 1 || list!.ids.length === list!.limit)

  async function step(by: -1 | 1) {
    if (!list || moving) return
    let { ids, skip } = list
    let at = index + by
    // Past either end of the page: the neighbouring page of the same list, same filters.
    if (at < 0 || at >= ids.length) {
      setMoving(true)
      try {
        skip = at < 0 ? Math.max(0, skip - list.limit) : skip + list.limit
        ids = (await fetchListPage(list, skip)).ids
      } catch {
        return
      } finally {
        setMoving(false)
      }
      at = at < 0 ? ids.length - 1 : 0
      if (ids[at] === undefined) return
    }
    const next: ListContext = { ...list, skip, ids }
    // Replaced, not added: Back still leads to the list, not through every record seen.
    navigate(`${list.recordBase}/${ids[at]}`, {
      replace: true,
      state: { ...(location.state as object), list: next },
    })
  }

  // Alt + arrow keys, as in a browser's own back and forward, except while typing.
  useEffect(() => {
    if (position === null) return
    function onKey(event: KeyboardEvent) {
      if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
      const target = event.target
      const typing =
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable="true"]') !== null
      if (typing) return
      event.preventDefault()
      if (event.key === 'ArrowLeft' && hasPrevious) void step(-1)
      if (event.key === 'ArrowRight' && hasNext) void step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (position === null) return null
  return (
    <nav aria-label="Records" className="flex items-center gap-1 text-sm text-muted-foreground">
      <span className="mr-1 tabular-nums">
        {position}
        {total.data !== undefined && ` / ${total.data}`}
      </span>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Previous record"
        title="Previous (Alt+←)"
        disabled={!hasPrevious || moving}
        onClick={() => void step(-1)}
      >
        <ChevronLeft />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Next record"
        title="Next (Alt+→)"
        disabled={!hasNext || moving}
        onClick={() => void step(1)}
      >
        <ChevronRight />
      </Button>
    </nav>
  )
}

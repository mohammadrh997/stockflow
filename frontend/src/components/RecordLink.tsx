import { useContext, type ReactNode } from 'react'
import { Link } from 'react-router'

import { RowStateContext } from '@/lib/recordPager'

// A link to a record from a row of a list. It carries the list along (see DataTable's
// rowState), so the record can step through that same list.
export function RecordLink({ to, children }: { to: string; children: ReactNode }) {
  const state = useContext(RowStateContext)
  return (
    <Link to={to} state={state} className="font-medium hover:underline">
      {children}
    </Link>
  )
}

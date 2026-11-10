import type { ReactNode } from 'react'

import { formatDateTime } from '@/lib/format'

// A record's details in a row above its lines: each label sits over its value, and the
// row wraps onto more lines on narrow screens.
export function DetailStrip({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]">
      {children}
    </dl>
  )
}

export function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{children}</dd>
    </div>
  )
}

// When something happened and who did it, as two items ("Created", "Created by").
export function DoneByItems({
  label,
  at,
  by,
}: {
  label: string
  at: string
  by: { name: string } | null
}) {
  return (
    <>
      <DetailItem label={label}>{formatDateTime(at)}</DetailItem>
      {by && <DetailItem label={`${label} by`}>{by.name}</DetailItem>}
    </>
  )
}

import type { ReactNode } from 'react'

type Props = {
  // The page header: breadcrumbs and the record's name with its badges.
  header: ReactNode
  // Left, right above the details: where the record stands (a progress track, a note).
  status?: ReactNode
  // Right, on the same row: smart buttons, then what can be done with the record.
  actions?: ReactNode
  // The record's own details, as a block.
  details: ReactNode
  // Everything under the details: lines, payments, history...
  children?: ReactNode
}

// The shape every record page shares (orders, invoices, transfers, products, partners).
// On wide screens the right-hand column is kept free for an activity log later.
export function RecordLayout({ header, status, actions, details, children }: Props) {
  return (
    <div className="grid gap-8">
      {header}
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 content-start gap-8">
          <div className="grid gap-3">
            {(status || actions) && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">{status}</div>
                <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
              </div>
            )}
            {details}
          </div>
          {children}
        </div>
        <div className="hidden xl:block" />
      </div>
    </div>
  )
}

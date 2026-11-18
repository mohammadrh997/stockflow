import type { ReactNode } from 'react'

type Props = {
  // The page header: breadcrumbs and the record's name with its badges.
  header: ReactNode
  // Left, right above the details: where the record stands (a progress track, a note).
  status?: ReactNode
  // Right, on the same row: smart buttons, then what can be done with the record.
  actions?: ReactNode
  // Right of the record's name, above the smart buttons: previous and next through the
  // list it came from.
  pager?: ReactNode
  // The record's own details, as a block.
  details: ReactNode
  // Everything under the details: lines, payments, history...
  children?: ReactNode
}

// The shape every record page shares (orders, invoices, transfers, products, partners).
// On very wide screens the right-hand column is kept free for an activity log later;
// below that the content takes the full width, so the row of buttons has room.
export function RecordLayout({ header, status, actions, pager, details, children }: Props) {
  const top = pager ? (
    // Lined up with the name, at the bottom of the header (the breadcrumb is above).
    <div className="flex flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1">{header}</div>
      <div className="ml-auto">{pager}</div>
    </div>
  ) : (
    header
  )

  return (
    // The header shares the content's column, so the pager's right edge lines up with
    // the buttons under it even when the log column is kept free.
    <div className="grid gap-8 2xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 content-start gap-8">
        {top}
        <div className="grid gap-3">
          {status ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap items-center gap-3">{status}</div>
              {/* ml-auto keeps them on the right, even when they wrap onto their own line. */}
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{actions}</div>
            </div>
          ) : (
            // Without a status, the smart buttons lead from the left.
            actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
          {details}
        </div>
        {children}
      </div>
      <div className="hidden 2xl:block" />
    </div>
  )
}

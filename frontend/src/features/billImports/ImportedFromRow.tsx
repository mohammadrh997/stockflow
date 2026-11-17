import { Link } from 'react-router'

import { useImportOfOrder } from './queries'

// A row of a purchase order's details naming the supplier bill it was imported from.
// Nothing at all for an order made by hand, or while that's still being looked up.
export function ImportedFromRow({ orderId }: { orderId: number }) {
  const source = useImportOfOrder(orderId)
  if (!source.data) return null
  const bill = source.data
  return (
    <>
      <dt className="text-muted-foreground">Imported from</dt>
      <dd>
        <Link to={`/bill-imports/${bill.id}`} className="font-medium hover:underline">
          {bill.partner_reference ? `Bill ${bill.partner_reference}` : `Bill import #${bill.id}`}
        </Link>
      </dd>
    </>
  )
}

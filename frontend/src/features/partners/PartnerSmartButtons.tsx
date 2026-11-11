import { FileText, ReceiptText, ShoppingCart, Truck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { can } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { SMART_BUTTON, SmartButtonFace, SmartButtonLoading } from '@/components/SmartButton'
import { formatMoney } from '@/lib/format'
import type { Partner } from './queries'
import { usePartnerSummary, type PartnerSummary } from './usePartnerActivity'

type Totals<K extends keyof PartnerSummary> = NonNullable<PartnerSummary[K]>

function OrdersButton({
  kind,
  partnerId,
  totals,
}: {
  kind: 'sales' | 'purchase'
  partnerId: number
  totals: Totals<'sales_orders'> | Totals<'purchase_orders'>
}) {
  const noun = kind === 'sales' ? 'sales order' : 'purchase order'
  return (
    <Link to={`/${kind}-orders?partner=${partnerId}`} className={SMART_BUTTON}>
      <SmartButtonFace
        icon={kind === 'sales' ? ShoppingCart : Truck}
        value={String(totals.count)}
        // "1 sales order", "2 sales orders"
        label={totals.count === 1 ? noun : `${noun}s`}
        detail={`${formatMoney(totals.total)} in total`}
      />
    </Link>
  )
}

function InvoicedButton({
  customer,
  partnerId,
  totals,
}: {
  customer: boolean
  partnerId: number
  totals: Totals<'customer_invoices'> | Totals<'vendor_bills'>
}) {
  const type = customer ? 'customer_invoice' : 'vendor_bill'
  return (
    <Link to={`/invoices?type=${type}&partner=${partnerId}`} className={SMART_BUTTON}>
      <SmartButtonFace
        icon={customer ? ReceiptText : FileText}
        value={formatMoney(totals.invoiced)}
        label={customer ? 'invoiced' : 'billed'}
        detail={`${formatMoney(totals.due)} still due`}
      />
    </Link>
  )
}

function Placeholder({ failed, customer }: { failed: boolean; customer: boolean }) {
  return (
    <span className={SMART_BUTTON} aria-busy={!failed}>
      <SmartButtonFace
        icon={customer ? ShoppingCart : Truck}
        value={failed ? '?' : <SmartButtonLoading wide />}
        label={failed ? 'Could not load the totals' : ''}
      />
    </span>
  )
}

// Shortcuts above a partner: its orders and what was invoiced, for each role it has.
// The server leaves out the areas the user can't see.
export function PartnerSmartButtons({ partner }: { partner: Partner }) {
  const { user } = useAuth()
  const customer = partner.is_customer
  const supplier = partner.is_supplier
  // Sales users see a customer's figures, purchase users a supplier's.
  const seesAny = (customer && can(user, 'sales')) || (supplier && can(user, 'purchase'))
  const summary = usePartnerSummary(partner.id, seesAny)

  if (!seesAny) return null
  if (!summary.data) {
    return (
      <div className="flex flex-wrap gap-2">
        <Placeholder failed={summary.isError} customer={customer} />
      </div>
    )
  }

  const { sales_orders, customer_invoices, purchase_orders, vendor_bills } = summary.data
  const buttons: ReactNode[] = [
    customer && sales_orders && (
      <OrdersButton key="so" kind="sales" partnerId={partner.id} totals={sales_orders} />
    ),
    customer && customer_invoices && (
      <InvoicedButton key="inv" customer partnerId={partner.id} totals={customer_invoices} />
    ),
    supplier && purchase_orders && (
      <OrdersButton key="po" kind="purchase" partnerId={partner.id} totals={purchase_orders} />
    ),
    supplier && vendor_bills && (
      <InvoicedButton key="bill" customer={false} partnerId={partner.id} totals={vendor_bills} />
    ),
  ].filter(Boolean)

  if (buttons.length === 0) return null
  return <div className="flex flex-wrap gap-2">{buttons}</div>
}

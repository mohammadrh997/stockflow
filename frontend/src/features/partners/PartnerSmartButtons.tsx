import { FileText, ReceiptText, ShoppingCart, Truck } from 'lucide-react'
import { Link } from 'react-router'

import { can, canViewInvoices } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { SMART_BUTTON, SmartButtonFace, SmartButtonLoading } from '@/components/SmartButton'
import { formatMoney } from '@/lib/format'
import { usePartnerInvoiced, usePartnerOrders } from './usePartnerActivity'
import type { Partner } from './queries'

function OrdersButton({ kind, partnerId }: { kind: 'sales' | 'purchase'; partnerId: number }) {
  const orders = usePartnerOrders(kind, partnerId, true)
  const { data } = orders
  const plus = data?.partial ? '+' : ''
  const noun = kind === 'sales' ? 'sales order' : 'purchase order'

  return (
    <Link to={`/${kind}-orders?partner=${partnerId}`} className={SMART_BUTTON}>
      <SmartButtonFace
        icon={kind === 'sales' ? ShoppingCart : Truck}
        value={orders.isError ? '?' : data ? `${data.count}${plus}` : <SmartButtonLoading />}
        // "1 sales order", "2 sales orders"
        label={data?.count === 1 && !data.partial ? noun : `${noun}s`}
        detail={data && `${formatMoney(data.total)}${plus} in total`}
      />
    </Link>
  )
}

function InvoicedButton({ customer, partnerId }: { customer: boolean; partnerId: number }) {
  const type = customer ? 'customer_invoice' : 'vendor_bill'
  const invoiced = usePartnerInvoiced(type, partnerId, true)
  const { data } = invoiced
  const plus = data?.partial ? '+' : ''

  return (
    <Link to={`/invoices?type=${type}&partner=${partnerId}`} className={SMART_BUTTON}>
      <SmartButtonFace
        icon={customer ? ReceiptText : FileText}
        value={
          invoiced.isError ? (
            '?'
          ) : data ? (
            `${formatMoney(data.invoiced)}${plus}`
          ) : (
            <SmartButtonLoading wide />
          )
        }
        label={customer ? 'invoiced' : 'billed'}
        detail={data && `${formatMoney(data.due)}${plus} still due`}
      />
    </Link>
  )
}

// Shortcuts above a partner: its orders and what was invoiced, for each role it has
// and each area the user can see.
export function PartnerSmartButtons({ partner }: { partner: Partner }) {
  const { user } = useAuth()
  const invoices = canViewInvoices(user)
  const customer = partner.is_customer
  const supplier = partner.is_supplier
  const buttons = [
    customer && can(user, 'sales') && <OrdersButton key="so" kind="sales" partnerId={partner.id} />,
    customer && invoices && <InvoicedButton key="inv" customer partnerId={partner.id} />,
    supplier && can(user, 'purchase') && (
      <OrdersButton key="po" kind="purchase" partnerId={partner.id} />
    ),
    supplier && invoices && <InvoicedButton key="bill" customer={false} partnerId={partner.id} />,
  ].filter(Boolean)

  if (buttons.length === 0) return null
  return <div className="flex flex-wrap gap-2">{buttons}</div>
}

import { Link } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { usePurchaseOrder } from '@/features/purchase/queries'
import { useSalesOrder } from '@/features/sales/queries'
import { cn } from '@/lib/utils'
import { isOverdue } from './invoiceInfo'
import type { Invoice } from './queries'

const PAYMENT = {
  not_paid: { label: 'Not paid', style: 'bg-muted text-muted-foreground' },
  partial: {
    label: 'Partly paid',
    style: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  },
  paid: {
    label: 'Paid',
    style: 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200',
  },
}

// Payment status only means something once an invoice is posted.
export function PaymentBadge({ invoice }: { invoice: Invoice }) {
  if (invoice.state !== 'posted') return null
  const { label, style } = PAYMENT[invoice.payment_state]
  return <Badge className={style}>{label}</Badge>
}

export function OverdueBadge({ invoice, today }: { invoice: Invoice; today: string }) {
  if (!isOverdue(invoice, today)) return null
  return (
    <Badge className={cn('bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200')}>
      Overdue
    </Badge>
  )
}

function SalesOrderLink({ id }: { id: number }) {
  const order = useSalesOrder(id)
  return (
    <Link to={`/sales-orders/${id}`} className="hover:underline">
      {order.data?.reference ?? `Sales order #${id}`}
    </Link>
  )
}

function PurchaseOrderLink({ id }: { id: number }) {
  const order = usePurchaseOrder(id)
  return (
    <Link to={`/purchase-orders/${id}`} className="hover:underline">
      {order.data?.reference ?? `Purchase order #${id}`}
    </Link>
  )
}

// The order an invoice bills. Anyone who can see the invoice can open its order.
export function InvoiceOrderLink({ invoice }: { invoice: Invoice }) {
  if (invoice.sales_order_id !== null) return <SalesOrderLink id={invoice.sales_order_id} />
  if (invoice.purchase_order_id !== null) {
    return <PurchaseOrderLink id={invoice.purchase_order_id} />
  }
  return null
}

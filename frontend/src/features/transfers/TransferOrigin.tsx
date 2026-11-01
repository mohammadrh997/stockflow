import { Link } from 'react-router'

import { can } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { usePurchaseOrder } from '@/features/purchase/queries'
import { useSalesOrder } from '@/features/sales/queries'
import type { Transfer } from './queries'

function PurchaseOrderLink({ id }: { id: number }) {
  const order = usePurchaseOrder(id)
  return (
    <Link to={`/purchase-orders/${id}`} className="hover:underline">
      {order.data?.reference ?? `Purchase order #${id}`}
    </Link>
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

// The order a receipt or delivery belongs to. Only linked (and fetched) for people who can open it.
export function TransferOrigin({ transfer }: { transfer: Transfer }) {
  const { user } = useAuth()

  if (transfer.purchase_order_id !== null) {
    return can(user, 'purchase') ? (
      <PurchaseOrderLink id={transfer.purchase_order_id} />
    ) : (
      <>Purchase order #{transfer.purchase_order_id}</>
    )
  }
  if (transfer.sales_order_id !== null) {
    return can(user, 'sales') ? (
      <SalesOrderLink id={transfer.sales_order_id} />
    ) : (
      <>Sales order #{transfer.sales_order_id}</>
    )
  }
  return <span className="text-muted-foreground">—</span>
}

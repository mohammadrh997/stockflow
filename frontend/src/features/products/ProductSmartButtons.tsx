import { ArrowLeftRight, Boxes, ShoppingCart, Truck, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { can } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { StateBadge } from '@/components/StateBadge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { useStock } from '@/features/stock/queries'
import { formatQuantity } from '@/lib/format'
import { sumQuantities, toThousandths } from '@/lib/quantity'
import { cn } from '@/lib/utils'
import { useProductMoves } from './useProductMoves'
import {
  useProductPurchaseOrders,
  useProductSalesOrders,
  type ProductOrders,
} from './useProductOrders'

const BUTTON =
  'flex min-w-36 items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/60'

function Face({
  icon: Icon,
  value,
  label,
  detail,
}: {
  icon: LucideIcon
  value: ReactNode
  label: string
  detail?: ReactNode
}) {
  return (
    <>
      <Icon className="size-5 shrink-0 text-primary" />
      <span className="grid leading-tight">
        <span className="text-sm">
          <span className="font-semibold tabular-nums">{value}</span> {label}
        </span>
        {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
      </span>
    </>
  )
}

function StockButton({ productId }: { productId: number }) {
  const stock = useStock({ product_id: productId })
  const rows = stock.data ?? []
  const onHand = sumQuantities(rows.map((row) => row.on_hand))
  const available = sumQuantities(rows.map((row) => row.available))

  return (
    <Link to={`/stock?product=${productId}`} className={BUTTON}>
      <Face
        icon={Boxes}
        value={
          stock.isPending ? <Skeleton className="inline-block h-4 w-6" /> : formatQuantity(onHand)
        }
        label="on hand"
        detail={stock.isPending ? undefined : `${formatQuantity(available)} available`}
      />
    </Link>
  )
}

// What came in and went out, with stock counts kept apart; opens the full moves history.
function MovesButton({ productId }: { productId: number }) {
  const moves = useProductMoves(productId)
  const totals = moves.data?.totals
  const plus = moves.data?.partial ? '+' : ''
  const counted =
    totals && (toThousandths(totals.countedUp) > 0n || toThousandths(totals.countedDown) > 0n)
      ? `Counts +${formatQuantity(totals.countedUp)} / −${formatQuantity(totals.countedDown)}`
      : 'Moves history'

  return (
    <Link to={`/products/${productId}/moves`} className={BUTTON}>
      <Face
        icon={ArrowLeftRight}
        value={
          moves.error ? (
            '?'
          ) : totals ? (
            <>
              {formatQuantity(totals.in)}
              {plus} <span className="font-normal">in ·</span> {formatQuantity(totals.out)}
              {plus} <span className="font-normal">out</span>
            </>
          ) : (
            <Skeleton className="inline-block h-4 w-16" />
          )
        }
        label=""
        detail={totals ? counted : undefined}
      />
    </Link>
  )
}

type OrdersProps = {
  query: { data?: ProductOrders; isPending: boolean; isError: boolean }
  icon: LucideIcon
  label: string
  done: string
  path: string
}

// How many orders hold the product, opening a list of them.
function OrdersButton({ query, icon, label, done, path }: OrdersProps) {
  const { data } = query
  const count = data ? `${data.orders.length}${data.partial ? '+' : ''}` : null

  return (
    <Popover>
      <PopoverTrigger className={BUTTON} aria-label={count === null ? label : `${label}: ${count}`}>
        <Face
          icon={icon}
          value={query.isError ? '?' : (count ?? <Skeleton className="inline-block h-4 w-6" />)}
          // "1 sales order", "2 sales orders"
          label={data?.orders.length === 1 ? label.replace(/s$/, '') : label}
          detail={data && `${formatQuantity(data.committed)} ${done}`}
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        {query.isError ? (
          <p className="p-2 text-sm text-destructive">Could not load the orders.</p>
        ) : !data ? (
          <p className="p-2 text-sm text-muted-foreground">Loading…</p>
        ) : data.orders.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">Not on any {label} yet.</p>
        ) : (
          <ul aria-label={label} className="grid max-h-80 gap-1 overflow-y-auto">
            {data.orders.map((order) => (
              <li key={order.id}>
                <Link
                  to={`${path}/${order.id}`}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <span className="font-medium">{order.reference}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground tabular-nums">
                      {formatQuantity(order.quantity)}
                    </span>
                    <StateBadge state={order.state} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {data?.partial && (
          <p className="p-2 text-xs text-muted-foreground">
            Only the oldest 3,000 orders were checked.
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}

// Odoo-style shortcuts at the top of a product: its stock, and the orders it appears on.
export function ProductSmartButtons({ productId }: { productId: number }) {
  const { user } = useAuth()
  const sales = can(user, 'sales')
  const purchase = can(user, 'purchase')
  const inventory = can(user, 'inventory')
  const salesOrders = useProductSalesOrders(productId, sales)
  const purchaseOrders = useProductPurchaseOrders(productId, purchase)

  return (
    <div className={cn('flex flex-wrap gap-2')}>
      <StockButton productId={productId} />
      {/* Moves come from transfers, which need inventory access to read. */}
      {inventory && <MovesButton productId={productId} />}
      {sales && (
        <OrdersButton
          query={salesOrders}
          icon={ShoppingCart}
          label="sales orders"
          done="sold"
          path="/sales-orders"
        />
      )}
      {purchase && (
        <OrdersButton
          query={purchaseOrders}
          icon={Truck}
          label="purchase orders"
          done="bought"
          path="/purchase-orders"
        />
      )}
    </div>
  )
}

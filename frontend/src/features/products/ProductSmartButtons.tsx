import { ArrowLeftRight, Boxes, ShoppingCart, Truck, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'

import { can } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { SMART_BUTTON, SmartButtonFace, SmartButtonLoading } from '@/components/SmartButton'
import { StateBadge } from '@/components/StateBadge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useStock } from '@/features/stock/queries'
import { formatQuantity } from '@/lib/format'
import { sumQuantities, toThousandths } from '@/lib/quantity'
import { cn } from '@/lib/utils'
import {
  useProductOrders,
  useProductSummary,
  type OrderKind,
  type ProductSummary,
} from './useProductOrders'

function StockButton({ productId }: { productId: number }) {
  const stock = useStock({ product_id: productId })
  const rows = stock.data ?? []
  const onHand = sumQuantities(rows.map((row) => row.on_hand))
  const available = sumQuantities(rows.map((row) => row.available))

  return (
    <Link to={`/stock?product=${productId}`} className={SMART_BUTTON}>
      <SmartButtonFace
        icon={Boxes}
        value={stock.isPending ? <SmartButtonLoading /> : formatQuantity(onHand)}
        label="on hand"
        detail={stock.isPending ? undefined : `${formatQuantity(available)} available`}
      />
    </Link>
  )
}

type SummaryQuery = { data?: ProductSummary; isError: boolean }

// What came in and went out, with stock counts kept apart; opens the full moves history.
function MovesButton({ productId, summary }: { productId: number; summary: SummaryQuery }) {
  const totals = summary.data?.stock
  const counted =
    totals && (toThousandths(totals.counted_up) > 0n || toThousandths(totals.counted_down) > 0n)
      ? `Counts +${formatQuantity(totals.counted_up)} / −${formatQuantity(totals.counted_down)}`
      : 'Moves history'

  return (
    <Link to={`/products/${productId}/moves`} className={SMART_BUTTON}>
      <SmartButtonFace
        icon={ArrowLeftRight}
        value={
          summary.isError ? (
            '?'
          ) : totals ? (
            <>
              {formatQuantity(totals.in)} <span className="font-normal">in ·</span>{' '}
              {formatQuantity(totals.out)} <span className="font-normal">out</span>
            </>
          ) : (
            <SmartButtonLoading wide />
          )
        }
        label=""
        detail={totals ? counted : undefined}
      />
    </Link>
  )
}

type OrdersProps = {
  kind: OrderKind
  productId: number
  // What confirmed and finished orders hold, from the summary.
  committed: string | undefined
  summaryFailed: boolean
  icon: LucideIcon
  label: string
  done: string
}

// How many orders hold the product, opening a list of them.
function OrdersButton({
  kind,
  productId,
  committed,
  summaryFailed,
  icon,
  label,
  done,
}: OrdersProps) {
  const query = useProductOrders(kind, productId, true)
  const { data } = query
  const count = data ? String(data.count) : null
  const path = `/${kind}-orders`

  return (
    <Popover>
      <PopoverTrigger
        className={SMART_BUTTON}
        aria-label={count === null ? label : `${label}: ${count}`}
      >
        <SmartButtonFace
          icon={icon}
          value={query.isError ? '?' : (count ?? <SmartButtonLoading />)}
          // "1 sales order", "2 sales orders"
          label={data?.count === 1 ? label.replace(/s$/, '') : label}
          detail={summaryFailed ? undefined : committed && `${formatQuantity(committed)} ${done}`}
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
        {data && !data.complete && (
          <p className="p-2 text-xs text-muted-foreground">Showing the newest orders only.</p>
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
  const summary = useProductSummary(productId)

  return (
    <div className={cn('flex flex-wrap gap-2')}>
      <StockButton productId={productId} />
      {/* Moves come from transfers, which need inventory access to read. */}
      {inventory && <MovesButton productId={productId} summary={summary} />}
      {sales && (
        <OrdersButton
          kind="sales"
          productId={productId}
          committed={summary.data?.sales?.committed_quantity}
          summaryFailed={summary.isError}
          icon={ShoppingCart}
          label="sales orders"
          done="sold"
        />
      )}
      {purchase && (
        <OrdersButton
          kind="purchase"
          productId={productId}
          committed={summary.data?.purchases?.committed_quantity}
          summaryFailed={summary.isError}
          icon={Truck}
          label="purchase orders"
          done="bought"
        />
      )}
    </div>
  )
}

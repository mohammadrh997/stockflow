import { PackageCheck, PackageX, Send, ShoppingCart, Truck } from 'lucide-react'
import { Link } from 'react-router'

import { can } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { visibleNavItems } from '@/components/layout/navigation'
import { usePurchaseOrders } from '@/features/purchase/queries'
import { useSalesOrders } from '@/features/sales/queries'
import { useStock } from '@/features/stock/queries'
import { useTransfers } from '@/features/transfers/queries'
import { PAGE_SIZE } from '@/lib/useListParams'
import { usePageTitle } from '@/lib/usePageTitle'
import { AttentionCard } from './AttentionCard'

const page = { skip: 0, limit: PAGE_SIZE }

export function HomePage() {
  const { user } = useAuth()
  usePageTitle()

  const inventory = can(user, 'inventory')
  const purchase = can(user, 'purchase')
  const sales = can(user, 'sales')

  const receipts = useTransfers(
    { transfer_type: 'receipt', state: 'ready', ...page },
    { enabled: inventory },
  )
  const deliveries = useTransfers(
    { transfer_type: 'delivery', state: 'ready', ...page },
    { enabled: inventory },
  )
  const purchaseDrafts = usePurchaseOrders({ state: 'draft', ...page }, { enabled: purchase })
  const salesDrafts = useSalesOrders({ state: 'draft', ...page }, { enabled: sales })
  const stock = useStock({})
  const unavailable = stock.data?.filter((row) => Number(row.available) <= 0)

  const draftTitle = (module: 'purchase' | 'sales', name: string) =>
    can(user, module, 'manager') ? `${name} to confirm` : `${name} in draft`

  return (
    <div className="grid gap-8">
      <h1 className="text-2xl font-semibold">Welcome, {user?.name}</h1>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Needs attention</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {inventory && (
            <>
              <AttentionCard
                title="Receipts to validate"
                icon={PackageCheck}
                to="/transfers?type=receipt&state=ready"
                rows={receipts.data}
                isPending={receipts.isPending}
                isError={receipts.isError}
                limit={PAGE_SIZE}
              />
              <AttentionCard
                title="Deliveries to validate"
                icon={Send}
                to="/transfers?type=delivery&state=ready"
                rows={deliveries.data}
                isPending={deliveries.isPending}
                isError={deliveries.isError}
                limit={PAGE_SIZE}
              />
            </>
          )}
          {purchase && (
            <AttentionCard
              title={draftTitle('purchase', 'Purchase orders')}
              icon={Truck}
              to="/purchase-orders?state=draft"
              rows={purchaseDrafts.data}
              isPending={purchaseDrafts.isPending}
              isError={purchaseDrafts.isError}
              limit={PAGE_SIZE}
            />
          )}
          {sales && (
            <AttentionCard
              title={draftTitle('sales', 'Sales orders')}
              icon={ShoppingCart}
              to="/sales-orders?state=draft"
              rows={salesDrafts.data}
              isPending={salesDrafts.isPending}
              isError={salesDrafts.isError}
              limit={PAGE_SIZE}
            />
          )}
          <AttentionCard
            title="Short on stock"
            icon={PackageX}
            to="/stock"
            rows={unavailable}
            isPending={stock.isPending}
            isError={stock.isError}
            detail={
              <span className="truncate text-sm text-muted-foreground">
                {unavailable
                  ?.slice(0, 3)
                  .map((row) => row.product_name)
                  .join(', ')}
              </span>
            }
          />
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Go to</h2>
        <div className="flex flex-wrap gap-2">
          {visibleNavItems(user).map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

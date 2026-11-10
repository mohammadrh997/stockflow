import { useParams } from 'react-router'
import { toast } from 'sonner'

import { ApiError } from '@/api/errors'
import { can } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DisabledReason } from '@/components/DisabledReason'
import { ErrorMessage } from '@/components/ErrorMessage'
import { NotFoundPage } from '@/components/NotFoundPage'
import { PageHeader } from '@/components/PageHeader'
import { PageSpinner } from '@/components/PageSpinner'
import { ProgressTrack } from '@/components/ProgressTrack'
import { StateBadge } from '@/components/StateBadge'
import { Button } from '@/components/ui/button'
import { AddLineForm } from '@/features/orders/AddLineForm'
import { CreateInvoiceButton } from '@/features/orders/CreateInvoiceButton'
import { OrderInvoicesButton } from '@/features/orders/OrderInvoicesButton'
import { OrderMoreMenu } from '@/features/orders/OrderMoreMenu'
import { nothingToInvoiceReason, useOrderInvoices } from '@/features/orders/useOrderInvoices'
import { OrderMovementNote } from '@/features/orders/OrderMovementNote'
import { OrderTransfersButton } from '@/features/orders/OrderTransfersButton'
import { useOrderTransfers } from '@/features/orders/useOrderTransfers'
import { OrderDetailsPanel } from '@/features/orders/OrderDetailsPanel'
import { OrderLinesTable } from '@/features/orders/OrderLinesTable'
import {
  useSalesOrder,
  useSalesOrderAction,
  useSalesOrderLines,
  useUpdateSalesOrder,
} from './queries'
import { useAvailabilityHint } from './useAvailabilityHint'

export function SalesOrderPage() {
  const id = Number(useParams().orderId)
  const { user } = useAuth()
  const order = useSalesOrder(id)
  const updateOrder = useUpdateSalesOrder(id)
  const lines = useSalesOrderLines(id)
  const confirm = useSalesOrderAction(id, 'confirm')
  const cancel = useSalesOrderAction(id, 'cancel')
  // Transfers need inventory access to read, and exist only once the order is confirmed.
  const seesTransfers =
    can(user, 'inventory') && order.data !== undefined && order.data.state !== 'draft'
  const transfers = useOrderTransfers({ sales_order_id: id }, seesTransfers)
  // Invoicing is for users of the order's module, once the order is confirmed.
  const seesInvoices =
    can(user, 'sales') &&
    order.data !== undefined &&
    order.data.state !== 'draft' &&
    order.data.state !== 'cancelled'
  const invoices = useOrderInvoices({ sales_order_id: id }, seesInvoices)
  const isDraft = order.data?.state === 'draft'
  const availability = useAvailabilityHint(order.data?.warehouse_id, isDraft)

  if (order.isPending) return <PageSpinner />
  if (order.error instanceof ApiError && order.error.status === 404) return <NotFoundPage />
  if (order.isError) return <ErrorMessage error={order.error} onRetry={() => order.refetch()} />

  const { data } = order
  const canEdit = isDraft && can(user, 'sales')
  const canManage = can(user, 'sales', 'manager')
  const canCancel = canManage && (isDraft || data.state === 'confirmed')
  const trail = [
    { to: '/sales-orders', label: 'Sales orders' },
    { to: `/sales-orders/${data.id}`, label: data.reference },
  ]

  return (
    <div className="grid gap-8">
      <PageHeader
        pageTitle={data.reference}
        trail={[{ to: '/sales-orders', label: 'Sales orders' }]}
        title={
          <>
            {data.reference}
            <StateBadge state={data.state} />
          </>
        }
        actions={
          <>
            {seesTransfers && (
              <OrderTransfersButton kind="delivery" transfers={transfers.transfers} trail={trail} />
            )}
            {seesInvoices && (
              <OrderInvoicesButton kind="invoice" invoices={invoices.invoices} trail={trail} />
            )}
            {seesInvoices && (
              <CreateInvoiceButton
                kind="invoice"
                order={data}
                disabledReason={nothingToInvoiceReason(
                  'delivery',
                  data.lines,
                  seesTransfers ? transfers : null,
                  invoices.invoiced,
                )}
                trail={trail}
              />
            )}
            {canManage && isDraft && (
              <DisabledReason
                reason={data.lines.length === 0 ? 'Add at least one line first.' : null}
              >
                <ConfirmDialog
                  trigger={<Button disabled={data.lines.length === 0}>Confirm order</Button>}
                  title={`Confirm ${data.reference}?`}
                  description="The available stock is checked and reserved, the order can no longer be edited, and a delivery is created for the warehouse to validate."
                  confirmLabel="Confirm order"
                  onConfirm={async () => {
                    await confirm.mutateAsync()
                    toast.success(`Confirmed ${data.reference}`)
                  }}
                />
              </DisabledReason>
            )}
            {canCancel && (
              <DisabledReason
                reason={
                  transfers.hasMoved
                    ? 'Goods have already shipped. Cancel the backorder instead.'
                    : null
                }
              >
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" disabled={transfers.hasMoved}>
                      Cancel order
                    </Button>
                  }
                  title={`Cancel ${data.reference}?`}
                  description={
                    isDraft
                      ? 'The draft is kept for reference but can no longer be used.'
                      : 'Its delivery is cancelled and the reserved stock is released. This cannot be undone.'
                  }
                  confirmLabel="Cancel order"
                  destructive
                  onConfirm={async () => {
                    await cancel.mutateAsync()
                    toast.success(`Cancelled ${data.reference}`)
                  }}
                />
              </DisabledReason>
            )}
            {/* Last, after the main actions; the server can't print a cancelled order. */}
            {data.state !== 'cancelled' && (
              <OrderMoreMenu
                source={{ kind: 'sales-order', id: data.id }}
                reference={data.reference}
              />
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <ProgressTrack steps={['draft', 'confirmed', 'delivered']} state={data.state} />
        {seesTransfers && (
          <OrderMovementNote
            kind="delivery"
            state={data.state}
            lines={data.lines}
            transfers={transfers}
          />
        )}
      </div>

      {/* The right-hand column is kept free for an activity log later. */}
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 content-start gap-8">
          <OrderDetailsPanel
            role="customer"
            order={data}
            editable={canEdit}
            onSave={(details) => updateOrder.mutateAsync(details)}
          />

          <section className="grid min-w-0 gap-3">
            <h2 className="text-lg font-semibold">Lines</h2>
            <OrderLinesTable
              lines={data.lines}
              total={data.total}
              editable={canEdit}
              progress={[
                ...(seesTransfers ? [{ header: 'Delivered', done: transfers.moved }] : []),
                ...(seesInvoices ? [{ header: 'Invoiced', done: invoices.invoiced }] : []),
              ]}
              hint={canEdit ? availability : undefined}
              onUpdate={(lineId, changes) => lines.update.mutateAsync({ lineId, changes })}
              onDelete={(lineId) => lines.remove.mutateAsync(lineId)}
            />
            {canEdit && (
              <AddLineForm
                defaultPrice="sale_price"
                hint={availability}
                onAdd={(line) => lines.add.mutateAsync(line)}
              />
            )}
          </section>
        </div>
        <div className="hidden xl:block" />
      </div>
    </div>
  )
}

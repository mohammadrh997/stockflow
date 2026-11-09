import { useParams } from 'react-router'
import { toast } from 'sonner'

import { ApiError } from '@/api/errors'
import { can } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DisabledReason } from '@/components/DisabledReason'
import { DoneByRows } from '@/components/DoneByRows'
import { ErrorMessage } from '@/components/ErrorMessage'
import { NotFoundPage } from '@/components/NotFoundPage'
import { PageHeader } from '@/components/PageHeader'
import { PageSpinner } from '@/components/PageSpinner'
import { ProgressTrack } from '@/components/ProgressTrack'
import { PartnerName, WarehouseName } from '@/components/RecordNames'
import { StateBadge } from '@/components/StateBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AddLineForm } from '@/features/orders/AddLineForm'
import { DownloadPdfButton } from '@/features/documents/DownloadPdfButton'
import { CreateInvoiceButton } from '@/features/orders/CreateInvoiceButton'
import { OrderInvoicesButton } from '@/features/orders/OrderInvoicesButton'
import { nothingToInvoiceReason, useOrderInvoices } from '@/features/orders/useOrderInvoices'
import { OrderMovementNote } from '@/features/orders/OrderMovementNote'
import { OrderTransfersButton } from '@/features/orders/OrderTransfersButton'
import { useOrderTransfers } from '@/features/orders/useOrderTransfers'
import { OrderDetailsForm } from '@/features/orders/OrderDetailsForm'
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
            {data.state !== 'cancelled' && (
              <DownloadPdfButton
                source={{ kind: 'sales-order', id: data.id }}
                fallbackName={data.reference}
              />
            )}
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

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
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

        <aside className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {canEdit ? (
                <OrderDetailsForm
                  // Remount with what the server saved.
                  key={`${data.partner_id}|${data.warehouse_id}`}
                  role="customer"
                  defaultValues={{ partner_id: data.partner_id, warehouse_id: data.warehouse_id }}
                  submitLabel="Save details"
                  onSubmit={async (details) => {
                    await updateOrder.mutateAsync(details)
                    toast.success('Order saved')
                  }}
                />
              ) : (
                <dl className="grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Customer</dt>
                  <dd>
                    <PartnerName id={data.partner_id} />
                  </dd>
                  <dt className="text-muted-foreground">Warehouse</dt>
                  <dd>
                    <WarehouseName id={data.warehouse_id} />
                  </dd>
                  <DoneByRows label="Created" at={data.created_at} by={data.created_by} />
                </dl>
              )}
              {canEdit && (
                // Under the form, the same rows on their own.
                <dl className="grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm border-t pt-3">
                  <DoneByRows label="Created" at={data.created_at} by={data.created_by} />
                </dl>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}

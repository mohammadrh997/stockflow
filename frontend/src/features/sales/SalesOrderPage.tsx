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
import { PartnerName, WarehouseName } from '@/components/RecordNames'
import { StateBadge } from '@/components/StateBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AddLineForm } from '@/features/orders/AddLineForm'
import { LinkedTransfers } from '@/features/orders/LinkedTransfers'
import { OrderDetailsForm } from '@/features/orders/OrderDetailsForm'
import { OrderLinesTable } from '@/features/orders/OrderLinesTable'
import { formatDateTime } from '@/lib/format'
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
  const isDraft = order.data?.state === 'draft'
  const availability = useAvailabilityHint(order.data?.warehouse_id, isDraft)

  if (order.isPending) return <PageSpinner />
  if (order.error instanceof ApiError && order.error.status === 404) return <NotFoundPage />
  if (order.isError) return <ErrorMessage error={order.error} onRetry={() => order.refetch()} />

  const { data } = order
  const canEdit = isDraft && can(user, 'sales')
  const canManage = can(user, 'sales', 'manager')
  const canCancel = canManage && (isDraft || data.state === 'confirmed')

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
              <ConfirmDialog
                trigger={<Button variant="outline">Cancel order</Button>}
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
            )}
          </>
        }
      />

      <ProgressTrack steps={['draft', 'confirmed', 'delivered']} state={data.state} />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <section className="grid min-w-0 gap-3">
          <h2 className="text-lg font-semibold">Lines</h2>
          <OrderLinesTable
            lines={data.lines}
            total={data.total}
            editable={canEdit}
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
                </dl>
              )}
              <p className="text-sm text-muted-foreground">
                Created {formatDateTime(data.created_at)}
              </p>
            </CardContent>
          </Card>
          {!isDraft && can(user, 'inventory') && (
            <Card>
              <CardContent>
                <LinkedTransfers title="Delivery" filter={{ sales_order_id: data.id }} />
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  )
}

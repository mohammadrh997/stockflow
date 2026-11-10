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
import { RecordLayout } from '@/components/RecordLayout'
import { PageSpinner } from '@/components/PageSpinner'
import { ProgressTrack } from '@/components/ProgressTrack'
import { StateBadge } from '@/components/StateBadge'
import { Button } from '@/components/ui/button'
import { AddLineForm } from '@/features/orders/AddLineForm'
import { CreateInvoiceButton } from '@/features/orders/CreateInvoiceButton'
import { OrderInvoicesButton } from '@/features/orders/OrderInvoicesButton'
import { OrderMoreMenu } from '@/features/orders/OrderMoreMenu'
import { nothingToInvoiceReason, useOrderInvoices } from '@/features/orders/useOrderInvoices'
import { orderMovementText } from '@/features/orders/orderMovement'
import { OrderTransfersButton } from '@/features/orders/OrderTransfersButton'
import { useOrderTransfers } from '@/features/orders/useOrderTransfers'
import { OrderDetailsPanel } from '@/features/orders/OrderDetailsPanel'
import { OrderLinesTable } from '@/features/orders/OrderLinesTable'
import {
  usePurchaseOrder,
  usePurchaseOrderAction,
  usePurchaseOrderLines,
  useUpdatePurchaseOrder,
} from './queries'

export function PurchaseOrderPage() {
  const id = Number(useParams().orderId)
  const { user } = useAuth()
  const order = usePurchaseOrder(id)
  const updateOrder = useUpdatePurchaseOrder(id)
  const lines = usePurchaseOrderLines(id)
  const confirm = usePurchaseOrderAction(id, 'confirm')
  const cancel = usePurchaseOrderAction(id, 'cancel')
  // Transfers need inventory access to read, and exist only once the order is confirmed.
  const seesTransfers =
    can(user, 'inventory') && order.data !== undefined && order.data.state !== 'draft'
  const transfers = useOrderTransfers({ purchase_order_id: id }, seesTransfers)
  // Invoicing is for users of the order's module, once the order is confirmed.
  const seesInvoices =
    can(user, 'purchase') &&
    order.data !== undefined &&
    order.data.state !== 'draft' &&
    order.data.state !== 'cancelled'
  const invoices = useOrderInvoices({ purchase_order_id: id }, seesInvoices)

  if (order.isPending) return <PageSpinner />
  if (order.error instanceof ApiError && order.error.status === 404) return <NotFoundPage />
  if (order.isError) return <ErrorMessage error={order.error} onRetry={() => order.refetch()} />

  const { data } = order
  const isDraft = data.state === 'draft'
  const canEdit = isDraft && can(user, 'purchase')
  const canManage = can(user, 'purchase', 'manager')
  const canCancel = canManage && (isDraft || data.state === 'confirmed')
  const trail = [
    { to: '/purchase-orders', label: 'Purchase orders' },
    { to: `/purchase-orders/${data.id}`, label: data.reference },
  ]

  const cancelButton = canCancel && (
    <DisabledReason
      reason={
        transfers.hasMoved ? 'Goods have already arrived. Cancel the backorder instead.' : null
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
            : 'Its receipt is cancelled too. This cannot be undone.'
        }
        confirmLabel="Cancel order"
        destructive
        onConfirm={async () => {
          await cancel.mutateAsync()
          toast.success(`Cancelled ${data.reference}`)
        }}
      />
    </DisabledReason>
  )

  return (
    <RecordLayout
      header={
        <PageHeader
          pageTitle={data.reference}
          trail={[{ to: '/purchase-orders', label: 'Purchase orders' }]}
          title={
            <>
              {data.reference}
              <StateBadge state={data.state} />
            </>
          }
          // Less frequent actions about the order itself, next to its number.
          nameActions={
            data.state !== 'cancelled' && (
              <OrderMoreMenu
                source={{ kind: 'purchase-order', id: data.id }}
                reference={data.reference}
              />
            )
          }
        />
      }
      status={
        <>
          <ProgressTrack steps={['draft', 'confirmed', 'received']} state={data.state} />
          {/* Billing is the next step after the status, so it sits beside it. */}
          {seesInvoices && (
            <CreateInvoiceButton
              kind="bill"
              order={data}
              disabledReason={nothingToInvoiceReason(
                'receipt',
                data.lines,
                seesTransfers ? transfers : null,
                invoices.invoiced,
              )}
              trail={trail}
            />
          )}
          {/* On a draft, the next steps sit right beside the status. */}
          {canManage && isDraft && (
            <DisabledReason
              reason={data.lines.length === 0 ? 'Add at least one line first.' : null}
            >
              <ConfirmDialog
                trigger={<Button disabled={data.lines.length === 0}>Confirm order</Button>}
                title={`Confirm ${data.reference}?`}
                description="The order can no longer be edited, and a receipt is created for the warehouse to validate."
                confirmLabel="Confirm order"
                onConfirm={async () => {
                  await confirm.mutateAsync()
                  toast.success(`Confirmed ${data.reference}`)
                }}
              />
            </DisabledReason>
          )}
          {isDraft && cancelButton}
        </>
      }
      actions={
        <>
          {seesTransfers && (
            <OrderTransfersButton kind="receipt" transfers={transfers.transfers} trail={trail} />
          )}
          {seesInvoices && (
            <OrderInvoicesButton kind="bill" invoices={invoices.invoices} trail={trail} />
          )}
          {/* Once confirmed, cancelling sits with the other buttons on the right. */}
          {!isDraft && cancelButton}
        </>
      }
      details={
        <OrderDetailsPanel
          role="supplier"
          order={data}
          editable={canEdit}
          onSave={(details) => updateOrder.mutateAsync(details)}
          note={
            seesTransfers
              ? orderMovementText({
                  kind: 'receipt',
                  state: data.state,
                  lines: data.lines,
                  transfers,
                })
              : null
          }
        />
      }
    >
      <section className="grid min-w-0 gap-3">
        <h2 className="text-lg font-semibold">Lines</h2>
        <OrderLinesTable
          lines={data.lines}
          total={data.total}
          editable={canEdit}
          progress={[
            ...(seesTransfers ? [{ header: 'Received', done: transfers.moved }] : []),
            ...(seesInvoices ? [{ header: 'Invoiced', done: invoices.invoiced }] : []),
          ]}
          onUpdate={(lineId, changes) => lines.update.mutateAsync({ lineId, changes })}
          onDelete={(lineId) => lines.remove.mutateAsync(lineId)}
        />
        {canEdit && (
          <AddLineForm defaultPrice="cost_price" onAdd={(line) => lines.add.mutateAsync(line)} />
        )}
      </section>
    </RecordLayout>
  )
}

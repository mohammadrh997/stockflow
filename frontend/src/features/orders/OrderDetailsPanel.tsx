import { toast } from 'sonner'

import { DetailItem, DetailStrip, DoneByItems } from '@/components/DetailStrip'
import { Panel } from '@/components/Panel'
import { PartnerName, WarehouseName } from '@/components/RecordNames'
import { OrderDetailsForm, type OrderDetails } from './OrderDetailsForm'

type Props = {
  role: 'customer' | 'supplier'
  order: {
    partner_id: number
    warehouse_id: number
    created_at: string
    created_by: { name: string } | null
  }
  editable: boolean
  onSave: (details: OrderDetails) => Promise<unknown>
}

// Who the order is for, from which warehouse, and who made it: above the lines, so it's
// read first. On a draft that can be edited, the partner and warehouse are fields.
export function OrderDetailsPanel({ role, order, editable, onSave }: Props) {
  const created = <DoneByItems label="Created" at={order.created_at} by={order.created_by} />

  return (
    <Panel>
      {editable ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
          <OrderDetailsForm
            // Remount with what the server saved.
            key={`${order.partner_id}|${order.warehouse_id}`}
            role={role}
            defaultValues={{ partner_id: order.partner_id, warehouse_id: order.warehouse_id }}
            submitLabel="Save details"
            onSubmit={async (details) => {
              await onSave(details)
              toast.success('Order saved')
            }}
          />
          <div className="lg:w-80">
            <DetailStrip>{created}</DetailStrip>
          </div>
        </div>
      ) : (
        <DetailStrip>
          <DetailItem label={role === 'customer' ? 'Customer' : 'Supplier'}>
            <PartnerName id={order.partner_id} />
          </DetailItem>
          <DetailItem label="Warehouse">
            <WarehouseName id={order.warehouse_id} />
          </DetailItem>
          {created}
        </DetailStrip>
      )}
    </Panel>
  )
}

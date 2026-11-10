import { toast } from 'sonner'

import { DoneByRows } from '@/components/DoneByRows'
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
  // How far the goods have moved, when the progress steps can't say it ("Partly received...").
  note?: string | null
}

const ROWS = 'grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm'

// Who the order is for, from which warehouse, and who made it, as a block above the lines
// (like a transfer's). On a draft that can be edited, the partner and warehouse are fields.
export function OrderDetailsPanel({ role, order, editable, onSave, note }: Props) {
  const created = <DoneByRows label="Created" at={order.created_at} by={order.created_by} />

  return (
    <Panel>
      {editable ? (
        <div className="grid gap-4">
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
          <dl className={`${ROWS} border-t pt-4`}>{created}</dl>
        </div>
      ) : (
        <dl className={ROWS}>
          <dt className="text-muted-foreground">{role === 'customer' ? 'Customer' : 'Supplier'}</dt>
          <dd>
            <PartnerName id={order.partner_id} />
          </dd>
          <dt className="text-muted-foreground">Warehouse</dt>
          <dd>
            <WarehouseName id={order.warehouse_id} />
          </dd>
          {note && (
            <>
              <dt className="text-muted-foreground">Progress</dt>
              <dd>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                  {note}
                </span>
              </dd>
            </>
          )}
          {created}
        </dl>
      )}
    </Panel>
  )
}

import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Panel } from '@/components/Panel'
import { PageHeader } from '@/components/PageHeader'
import { OrderDetailsForm } from '@/features/orders/OrderDetailsForm'
import { useCreateSalesOrder } from './queries'

export function NewSalesOrderPage() {
  const navigate = useNavigate()
  const createOrder = useCreateSalesOrder()

  return (
    <div className="grid gap-6">
      <PageHeader
        title="New sales order"
        trail={[{ to: '/sales-orders', label: 'Sales orders' }]}
      />
      <p className="-mt-3 text-sm text-muted-foreground">
        Choose the customer first. You add the lines on the next page.
      </p>
      <Panel>
        <OrderDetailsForm
          role="customer"
          submitLabel="Create draft"
          onSubmit={async (details) => {
            const order = await createOrder.mutateAsync({ ...details, lines: [] })
            toast.success(`Created ${order.reference}`)
            navigate(`/sales-orders/${order.id}`, { replace: true })
          }}
        />
      </Panel>
    </div>
  )
}

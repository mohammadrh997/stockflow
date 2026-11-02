import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { PageHeader } from '@/components/PageHeader'
import { OrderDetailsForm } from '@/features/orders/OrderDetailsForm'
import { useCreatePurchaseOrder } from './queries'

export function NewPurchaseOrderPage() {
  const navigate = useNavigate()
  const createOrder = useCreatePurchaseOrder()

  return (
    <div className="grid gap-6">
      <PageHeader
        title="New purchase order"
        back={{ to: '/purchase-orders', label: 'Purchase orders' }}
      />
      <p className="-mt-3 text-sm text-muted-foreground">
        Choose the supplier first. You add the lines on the next page.
      </p>
      <OrderDetailsForm
        role="supplier"
        submitLabel="Create draft"
        onSubmit={async (details) => {
          const order = await createOrder.mutateAsync({ ...details, lines: [] })
          toast.success(`Created ${order.reference}`)
          navigate(`/purchase-orders/${order.id}`, { replace: true })
        }}
      />
    </div>
  )
}

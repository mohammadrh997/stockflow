import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ProductForm } from './ProductForm'
import { useCreateProduct, type Product } from './queries'

type Props = {
  // The name typed in the picker; the dialog is open while this is set.
  name: string | null
  emphasise: 'sale_price' | 'cost_price'
  onClose: () => void
  onCreated: (product: Product) => void
}

// Creates a product without leaving the order being edited.
export function QuickCreateProductDialog({ name, emphasise, onClose, onCreated }: Props) {
  const createProduct = useCreateProduct()

  return (
    <Dialog open={name !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New product</DialogTitle>
          <DialogDescription>It is added to this order once created.</DialogDescription>
        </DialogHeader>
        {name !== null && (
          <ProductForm
            defaultValues={{
              name,
              sku: '',
              sale_price: '',
              cost_price: emphasise === 'cost_price' ? '' : '0.00',
            }}
            emphasise={emphasise}
            submitLabel="Create product"
            onSubmit={async (values) => {
              const product = await createProduct.mutateAsync(values)
              toast.success(`Created ${product.name}`)
              onCreated(product)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

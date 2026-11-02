import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Panel } from '@/components/Panel'
import { PageHeader } from '@/components/PageHeader'
import { ProductForm } from './ProductForm'
import { useCreateProduct } from './queries'

export function NewProductPage() {
  const navigate = useNavigate()
  const createProduct = useCreateProduct()

  return (
    <div className="grid gap-6">
      <PageHeader title="New product" trail={[{ to: '/products', label: 'Products' }]} />
      <Panel>
        <ProductForm
          submitLabel="Create product"
          onSubmit={async (values) => {
            const product = await createProduct.mutateAsync(values)
            toast.success(`Created ${product.name}`)
            navigate(`/products/${product.id}`, { replace: true })
          }}
        />
      </Panel>
    </div>
  )
}

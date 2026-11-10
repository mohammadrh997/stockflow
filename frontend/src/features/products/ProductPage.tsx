import { useParams } from 'react-router'
import { toast } from 'sonner'

import { ApiError } from '@/api/errors'
import { can } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { ArchivedBadge } from '@/components/ArchivedBadge'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DoneByRows } from '@/components/DoneByRows'
import { ErrorMessage } from '@/components/ErrorMessage'
import { NotFoundPage } from '@/components/NotFoundPage'
import { Panel } from '@/components/Panel'
import { PageHeader } from '@/components/PageHeader'
import { RecordLayout } from '@/components/RecordLayout'
import { PageSpinner } from '@/components/PageSpinner'
import { Button } from '@/components/ui/button'
import { ProductForm } from './ProductForm'
import { ProductImage } from './ProductImage'
import { ProductSmartButtons } from './ProductSmartButtons'
import { useProduct, useSetProductArchived, useUpdateProduct } from './queries'

export function ProductPage() {
  const id = Number(useParams().productId)
  const { user } = useAuth()
  const product = useProduct(id)
  const updateProduct = useUpdateProduct(id)
  const setArchived = useSetProductArchived(id)
  const canManage = can(user, 'inventory', 'manager')

  if (product.isPending) return <PageSpinner />
  if (product.error instanceof ApiError && product.error.status === 404) return <NotFoundPage />
  if (product.isError) {
    return <ErrorMessage error={product.error} onRetry={() => product.refetch()} />
  }

  const { data } = product
  const archiving = data.is_active

  return (
    <RecordLayout
      header={
        <PageHeader
          pageTitle={data.name}
          trail={[{ to: '/products', label: 'Products' }]}
          title={
            <>
              {data.name}
              {!data.is_active && <ArchivedBadge />}
            </>
          }
          // Archiving changes the record itself, so it stays up with its name.
          actions={
            canManage && (
              <ConfirmDialog
                trigger={<Button variant="outline">{archiving ? 'Archive' : 'Unarchive'}</Button>}
                title={archiving ? `Archive ${data.name}?` : `Unarchive ${data.name}?`}
                description={
                  archiving
                    ? 'Archived products are hidden from lists and cannot be added to new orders.'
                    : 'The product will appear in lists and can be ordered again.'
                }
                confirmLabel={archiving ? 'Archive' : 'Unarchive'}
                destructive={archiving}
                onConfirm={async () => {
                  await setArchived.mutateAsync(archiving)
                  toast.success(archiving ? `Archived ${data.name}` : `Unarchived ${data.name}`)
                }}
              />
            )
          }
        />
      }
      actions={
        <>
          <ProductSmartButtons productId={data.id} />
        </>
      }
      details={
        <Panel>
          {/* The picture sits right beside the fields it belongs to; on phones, above them. */}
          <div className="grid gap-8 md:grid-cols-[16rem_minmax(0,1fr)]">
            <ProductImage product={data} canManage={canManage} />
            <div className="min-w-0">
              <ProductForm
                // Remount with what the server saved (it upper-cases the SKU, for example).
                key={[data.id, data.name, data.sku, data.sale_price, data.cost_price].join('|')}
                readOnly={!canManage}
                submitLabel="Save changes"
                defaultValues={{
                  name: data.name,
                  sku: data.sku,
                  sale_price: data.sale_price,
                  cost_price: data.cost_price,
                }}
                onSubmit={async (values) => {
                  await updateProduct.mutateAsync(values)
                  toast.success('Product saved')
                }}
              />
              <dl className="mt-6 grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm border-t pt-4">
                <DoneByRows label="Created" at={data.created_at} by={data.created_by} />
              </dl>
            </div>
          </div>
        </Panel>
      }
    />
  )
}

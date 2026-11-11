import { FolderTree, Package } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'

import { can } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { ArchivedBadge } from '@/components/ArchivedBadge'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ErrorMessage } from '@/components/ErrorMessage'
import { NotFoundPage } from '@/components/NotFoundPage'
import { PageHeader } from '@/components/PageHeader'
import { PageSpinner } from '@/components/PageSpinner'
import { Panel } from '@/components/Panel'
import { RecordLayout } from '@/components/RecordLayout'
import { SMART_BUTTON, SmartButtonFace, SmartButtonLoading } from '@/components/SmartButton'
import { Button } from '@/components/ui/button'
import { CategoryDetailsForm } from './CategoryDetailsForm'
import { CategoryDialog } from './CategoryDialog'
import {
  MAX_DEPTH,
  useCategories,
  useCategoryProductCount,
  useSetCategoryActive,
  type Category,
} from './queries'

// Its products, counting those in subcategories on the second line when it has any.
function ProductsButton({ category, hasChildren }: { category: Category; hasChildren: boolean }) {
  const direct = useCategoryProductCount(category.id, false)
  const withSubcategories = useCategoryProductCount(category.id, true)
  const count = direct.data
  return (
    <Link to={`/products?category=${category.id}`} className={SMART_BUTTON}>
      <SmartButtonFace
        icon={Package}
        value={direct.isError ? '?' : (count ?? <SmartButtonLoading />)}
        label={count === 1 ? 'product' : 'products'}
        detail={
          hasChildren && withSubcategories.data !== undefined
            ? `${withSubcategories.data} with subcategories`
            : undefined
        }
      />
    </Link>
  )
}

export function CategoryPage() {
  const id = Number(useParams().categoryId)
  const { user } = useAuth()
  const canManage = can(user, 'inventory', 'manager')
  // The whole tree is one small request, already cached by the list and the pickers.
  const all = useCategories(true)
  const active = useCategories(false)
  const setActive = useSetCategoryActive(id)
  const [adding, setAdding] = useState(false)

  if (all.isPending) return <PageSpinner />
  if (all.isError) return <ErrorMessage error={all.error} onRetry={() => all.refetch()} />
  const category = all.data.find((c) => c.id === id)
  if (!category) return <NotFoundPage />

  const children = all.data.filter((c) => c.parent_id === id)
  const archiving = category.is_active
  const canAddChild = canManage && category.is_active && category.depth < MAX_DEPTH

  return (
    <RecordLayout
      header={
        <PageHeader
          pageTitle={category.path}
          trail={[{ to: '/categories', label: 'Categories' }]}
          title={
            <>
              {category.name}
              {!category.is_active && <ArchivedBadge />}
            </>
          }
          nameActions={
            canManage && (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" size="sm">
                    {archiving ? 'Archive' : 'Restore'}
                  </Button>
                }
                title={archiving ? `Archive ${category.name}?` : `Restore ${category.name}?`}
                description={
                  archiving
                    ? 'It is hidden from the pickers. A category can only be archived once its products and subcategories are archived or moved.'
                    : 'It can be picked for products again.'
                }
                confirmLabel={archiving ? 'Archive' : 'Restore'}
                destructive={archiving}
                onConfirm={async () => {
                  await setActive.mutateAsync(!archiving)
                  toast.success(
                    archiving ? `Archived ${category.name}` : `Restored ${category.name}`,
                  )
                }}
              />
            )
          }
        />
      }
      actions={<ProductsButton category={category} hasChildren={children.length > 0} />}
      details={
        <Panel>
          <CategoryDetailsForm
            // Remount with what the server saved.
            key={[category.name, category.parent_id].join('|')}
            category={category}
            categories={active.data ?? []}
            readOnly={!canManage || !category.is_active}
          />
          {canManage && !category.is_active && (
            <p className="mt-4 text-sm text-muted-foreground">Restore it to make changes.</p>
          )}
        </Panel>
      }
    >
      <section className="grid min-w-0 gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Subcategories</h2>
          {canAddChild && (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              Add subcategory
            </Button>
          )}
        </div>
        {children.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <ul aria-label="Subcategories" className="flex flex-wrap gap-2">
            {children.map((child) => (
              <li key={child.id}>
                <Link to={`/categories/${child.id}`} className={SMART_BUTTON}>
                  <FolderTree className="size-4 shrink-0 text-primary" />
                  <span className="text-sm">{child.name}</span>
                  {!child.is_active && <ArchivedBadge />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <CategoryDialog
        categories={active.data ?? []}
        parentId={id}
        open={adding}
        onOpenChange={setAdding}
      />
    </RecordLayout>
  )
}

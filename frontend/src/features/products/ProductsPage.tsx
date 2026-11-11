import { Plus } from 'lucide-react'
import { Link } from 'react-router'

import { can } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { ArchivedBadge } from '@/components/ArchivedBadge'
import { DataTable, type Column } from '@/components/DataTable'
import { ListToolbar, SearchInput, ShowArchivedToggle } from '@/components/ListToolbar'
import { Money } from '@/components/Money'
import { PageHeader } from '@/components/PageHeader'
import { ProductThumb } from '@/components/ProductThumb'
import { Pagination } from '@/components/Pagination'
import { Button } from '@/components/ui/button'
import { useListParams } from '@/lib/useListParams'
import { CategoryFilter } from '@/features/categories/CategoryFilter'
import { categoryFilterParams } from '@/features/categories/categoryParams'
import { CategoryName } from '@/features/categories/CategoryPicker'
import { useProducts, type Product } from './queries'

const columns: Column<Product>[] = [
  {
    header: 'Name',
    cell: (product) => (
      <span className="flex items-center gap-2">
        <ProductThumb url={product.image_url} />
        <Link to={`/products/${product.id}`} className="font-medium hover:underline">
          {product.name}
        </Link>
      </span>
    ),
  },
  { header: 'SKU', cell: (product) => product.sku },
  { header: 'Category', cell: (product) => <CategoryName id={product.category_id} /> },
  {
    header: 'Sale price',
    className: 'text-right',
    cell: (product) => <Money value={product.sale_price} />,
  },
  {
    header: 'Cost price',
    className: 'text-right',
    cell: (product) => <Money value={product.cost_price} />,
  },
  { header: 'Status', cell: (product) => (product.is_active ? null : <ArchivedBadge />) },
]

export function ProductsPage() {
  const { user } = useAuth()
  const list = useListParams()
  const name = list.get('name')
  const showArchived = list.get('archived') === 'true'
  const products = useProducts({
    name: name || undefined,
    include_archived: showArchived,
    ...categoryFilterParams(list),
    skip: list.skip,
    limit: list.limit,
  })

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Products"
        actions={
          can(user, 'inventory', 'manager') && (
            <Button asChild>
              <Link to="/products/new">
                <Plus />
                New product
              </Link>
            </Button>
          )
        }
      />
      <ListToolbar>
        <SearchInput
          value={name}
          onChange={(value) => list.set('name', value)}
          placeholder="Search by name"
        />
        <CategoryFilter list={list} />
        <ShowArchivedToggle
          checked={showArchived}
          onChange={(checked) => list.set('archived', checked ? 'true' : '')}
        />
      </ListToolbar>
      <DataTable
        columns={columns}
        rows={products.data}
        rowKey={(product) => product.id}
        rowHref={(product) => `/products/${product.id}`}
        isPending={products.isPending}
        error={products.error}
        onRetry={() => products.refetch()}
        emptyAction={
          !name &&
          !list.get('category') &&
          can(user, 'inventory', 'manager') && (
            <Button asChild variant="outline">
              <Link to="/products/new">Create the first product</Link>
            </Button>
          )
        }
        emptyMessage={
          name || list.get('category') ? 'No products match these filters.' : 'No products yet.'
        }
      />
      <Pagination
        page={list.page}
        pageSize={list.limit}
        rowCount={products.data?.length}
        onPageChange={list.setPage}
      />
    </div>
  )
}

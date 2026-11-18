import { LayoutGrid, List as ListIcon, Plus } from 'lucide-react'
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
import { RecordLink } from '@/components/RecordLink'
import { useListState } from '@/lib/recordPager'
import { useListParams } from '@/lib/useListParams'
import { CategoryFilter } from '@/features/categories/CategoryFilter'
import { categoryFilterParams } from '@/features/categories/categoryParams'
import { CategoryName } from '@/features/categories/CategoryPicker'
import { ProductCards } from './ProductCards'
import { useProducts, type Product } from './queries'

const columns: Column<Product>[] = [
  {
    header: 'Name',
    cell: (product) => (
      <span className="flex items-center gap-2">
        <ProductThumb url={product.image_url} />
        <RecordLink to={`/products/${product.id}`}>{product.name}</RecordLink>
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

type View = 'cards' | 'list'

const VIEW_KEY = 'stockflow.productsView'

// The last view chosen in this browser; cards for someone who hasn't chosen.
function rememberedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'cards'
  } catch {
    return 'cards'
  }
}

function ViewSwitch({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  const options = [
    { value: 'cards' as const, label: 'Cards', icon: LayoutGrid },
    { value: 'list' as const, label: 'List', icon: ListIcon },
  ]
  return (
    <div role="group" aria-label="View" className="ml-auto flex rounded-md border bg-card p-0.5">
      {options.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          type="button"
          variant={view === value ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={view === value}
          onClick={() => onChange(value)}
        >
          <Icon />
          {label}
        </Button>
      ))}
    </div>
  )
}

export function ProductsPage() {
  const { user } = useAuth()
  const list = useListParams()
  const name = list.get('name')
  const showArchived = list.get('archived') === 'true'
  // In the address, so a shared link opens the same view; else the one chosen last.
  const requestedView = list.get('view')
  const view: View =
    requestedView === 'list' || requestedView === 'cards' ? requestedView : rememberedView()

  function chooseView(next: View) {
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // Without storage the choice still holds for this address.
    }
    list.set('view', next)
  }
  const query = {
    name: name || undefined,
    include_archived: showArchived,
    ...categoryFilterParams(list),
  }
  const products = useProducts({ ...query, skip: list.skip, limit: list.limit })
  // What each record opened from here gets, to step through this same list.
  const listState = useListState(
    { endpoint: '/products', query, limit: list.limit, skip: list.skip, recordBase: '/products' },
    products.data,
  )

  // The same empty state, whichever the view.
  const emptyAction = !name && !list.get('category') && can(user, 'inventory', 'manager') && (
    <Button asChild variant="outline">
      <Link to="/products/new">Create the first product</Link>
    </Button>
  )
  const emptyMessage =
    name || list.get('category') ? 'No products match these filters.' : 'No products yet.'

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
        <ViewSwitch view={view} onChange={chooseView} />
      </ListToolbar>
      {view === 'cards' ? (
        <ProductCards
          products={products.data}
          isPending={products.isPending}
          error={products.error}
          onRetry={() => products.refetch()}
          listState={listState}
          emptyMessage={emptyMessage}
          emptyAction={emptyAction}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={products.data}
          rowKey={(product) => product.id}
          rowHref={(product) => `/products/${product.id}`}
          rowState={listState}
          isPending={products.isPending}
          error={products.error}
          onRetry={() => products.refetch()}
          emptyAction={emptyAction}
          emptyMessage={emptyMessage}
        />
      )}
      <Pagination
        page={list.page}
        pageSize={list.limit}
        rowCount={products.data?.length}
        onPageChange={list.setPage}
      />
    </div>
  )
}

import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { ArchivedBadge } from '@/components/ArchivedBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Money } from '@/components/Money'
import { ProductThumb } from '@/components/ProductThumb'
import { Skeleton } from '@/components/ui/skeleton'
import { CategoryName } from '@/features/categories/CategoryPicker'
import type { ListState } from '@/lib/recordPager'
import { cn } from '@/lib/utils'
import type { Product } from './queries'

const GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6'
const LOADING_CARDS = 8

type Props = {
  products: Product[] | undefined
  isPending: boolean
  error: unknown
  onRetry: () => void
  // Handed to each product opened from here, to step through this same list.
  listState: ListState | undefined
  emptyMessage: string
  emptyAction?: ReactNode
}

// Products as a grid of cards, the picture first: the same list as the table, shown for
// people who find things by how they look.
export function ProductCards({
  products,
  isPending,
  error,
  onRetry,
  listState,
  emptyMessage,
  emptyAction,
}: Props) {
  if (error) return <ErrorMessage error={error} onRetry={onRetry} />
  if (isPending || !products) {
    return (
      <div className={GRID} aria-busy>
        {Array.from({ length: LOADING_CARDS }, (_, index) => (
          <div key={index} className="grid gap-3 rounded-lg border bg-card p-3">
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ))}
      </div>
    )
  }
  if (products.length === 0) {
    return (
      <div className="grid justify-items-center gap-3 rounded-lg border bg-card py-12 text-center text-muted-foreground">
        {emptyMessage}
        {emptyAction}
      </div>
    )
  }

  return (
    <ul aria-label="Products" className={GRID}>
      {products.map((product) => (
        <li key={product.id}>
          <Link
            to={`/products/${product.id}`}
            state={listState}
            className={cn(
              // A column, so the price sits at the bottom whatever the name's length.
              'group flex h-full flex-col gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/40',
              !product.is_active && 'opacity-70',
            )}
          >
            {/* The whole picture, letterboxed: product photos come in every shape. */}
            <ProductThumb
              url={product.image_url}
              className="aspect-square w-full bg-background object-contain"
            />
            <span className="grid gap-1">
              <span className="line-clamp-2 font-medium group-hover:underline">{product.name}</span>
              <span className="text-detail text-muted-foreground">{product.sku}</span>
              {product.category_id !== null && (
                <span className="truncate text-detail text-muted-foreground">
                  <CategoryName id={product.category_id} />
                </span>
              )}
            </span>
            <span className="mt-auto flex items-center justify-between gap-2">
              <span className="font-semibold">
                <Money value={product.sale_price} />
              </span>
              {!product.is_active && <ArchivedBadge />}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

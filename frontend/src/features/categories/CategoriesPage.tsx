import { useState, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'

import { can } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { ArchivedBadge } from '@/components/ArchivedBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { PageHeader } from '@/components/PageHeader'
import { PageSpinner } from '@/components/PageSpinner'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useListParams } from '@/lib/useListParams'
import { cn } from '@/lib/utils'
import { CategoryDialog } from './CategoryDialog'
import { useCategories } from './queries'

export function CategoriesPage() {
  const { user } = useAuth()
  const canManage = can(user, 'inventory', 'manager')
  const list = useListParams()
  const showArchived = list.get('archived') === '1'
  const categories = useCategories(showArchived)
  // New categories only ever go under active ones.
  const active = useCategories(false)
  const [adding, setAdding] = useState(false)
  const navigate = useNavigate()

  function openRow(event: MouseEvent, href: string) {
    if ((event.target as HTMLElement).closest('a, button')) return
    if (event.ctrlKey || event.metaKey) window.open(href, '_blank')
    else navigate(href)
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Categories"
        actions={canManage && <Button onClick={() => setAdding(true)}>New category</Button>}
      />
      <div className="flex items-center gap-2">
        <Checkbox
          id="show-archived"
          checked={showArchived}
          onCheckedChange={(checked) => list.set('archived', checked === true ? '1' : '')}
        />
        <Label htmlFor="show-archived">Show archived</Label>
      </div>
      {categories.isPending ? (
        <PageSpinner />
      ) : categories.error ? (
        <ErrorMessage error={categories.error} onRetry={() => categories.refetch()} />
      ) : categories.data.length === 0 ? (
        <Panel>
          <p className="text-sm text-muted-foreground">
            No categories yet.{canManage && ' Add one to start grouping products.'}
          </p>
        </Panel>
      ) : (
        <Panel className="max-w-3xl p-2 sm:p-2">
          <ul aria-label="Categories" className="grid">
            {categories.data.map((category) => (
              <li
                key={category.id}
                className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md py-1 pr-2 hover:bg-muted/60"
                // The whole row opens the category, like a table row.
                onClick={(event) => openRow(event, `/categories/${category.id}`)}
                // Each level is indented a step, so the tree reads at a glance.
                style={{ paddingLeft: `${0.75 + (category.depth - 1) * 1.5}rem` }}
              >
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-sm',
                    category.depth === 1 && 'font-medium',
                    !category.is_active && 'text-muted-foreground',
                  )}
                  title={category.path}
                >
                  <Link to={`/categories/${category.id}`} className="hover:underline">
                    {category.name}
                  </Link>
                </span>
                {!category.is_active && <ArchivedBadge />}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <CategoryDialog
        categories={active.data ?? []}
        parentId={null}
        open={adding}
        onOpenChange={setAdding}
      />
    </div>
  )
}

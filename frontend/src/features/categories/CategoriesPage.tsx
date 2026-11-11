import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { errorMessage } from '@/api/errors'
import { can } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { ArchivedBadge } from '@/components/ArchivedBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { PageHeader } from '@/components/PageHeader'
import { PageSpinner } from '@/components/PageSpinner'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { useListParams } from '@/lib/useListParams'
import { cn } from '@/lib/utils'
import { CategoryDialog } from './CategoryDialog'
import { MAX_DEPTH, useCategories, useSetCategoryActive, type Category } from './queries'

// What the dialog is open for: a new category (maybe under a parent), or editing one.
type Editing = { category?: Category; parentId?: number | null } | null

function RowMenu({
  category,
  onAdd,
  onEdit,
}: {
  category: Category
  onAdd: () => void
  onEdit: () => void
}) {
  const setActive = useSetCategoryActive(category.id)

  async function toggle() {
    try {
      await setActive.mutateAsync(!category.is_active)
      toast.success(category.is_active ? `Archived ${category.name}` : `Restored ${category.name}`)
    } catch (error) {
      // The server says why ("it still has active products"...).
      toast.error(errorMessage(error))
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${category.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {category.is_active && category.depth < MAX_DEPTH && (
          <DropdownMenuItem onSelect={onAdd}>Add subcategory</DropdownMenuItem>
        )}
        {category.is_active && (
          <DropdownMenuItem onSelect={onEdit}>Rename or move</DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void toggle()}>
          {category.is_active ? 'Archive' : 'Restore'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function CategoriesPage() {
  const { user } = useAuth()
  const canManage = can(user, 'inventory', 'manager')
  const list = useListParams()
  const showArchived = list.get('archived') === '1'
  const categories = useCategories(showArchived)
  // Moves and new parents only ever pick active categories.
  const active = useCategories(false)
  const [editing, setEditing] = useState<Editing>(null)

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Categories"
        actions={
          canManage && <Button onClick={() => setEditing({ parentId: null })}>New category</Button>
        }
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
                className="flex min-h-10 items-center gap-2 rounded-md py-1 pr-1 hover:bg-muted/60"
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
                  {category.name}
                </span>
                {!category.is_active && <ArchivedBadge />}
                {canManage && (
                  <RowMenu
                    category={category}
                    onAdd={() => setEditing({ parentId: category.id })}
                    onEdit={() => setEditing({ category })}
                  />
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <CategoryDialog
        categories={active.data ?? []}
        category={editing?.category}
        parentId={editing?.parentId}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </div>
  )
}

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { List } from './categoryParams'
import { CategoryPicker } from './CategoryPicker'

// The category picker for a list, and the choice to take in its subcategories (off at first).
export function CategoryFilter({ list }: { list: List }) {
  const category = list.get('category')
  return (
    <>
      <CategoryPicker
        value={category ? Number(category) : null}
        onChange={(id) => list.set('category', id === null ? '' : String(id))}
        placeholder="All categories"
        aria-label="Category"
      />
      {category && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="include-subcategories"
            checked={list.get('subcategories') === '1'}
            onCheckedChange={(state) => list.set('subcategories', state === true ? '1' : '')}
          />
          <Label htmlFor="include-subcategories">Include subcategories</Label>
        </div>
      )}
    </>
  )
}

import { MAX_DEPTH, type Category } from './queries'

// The category and everything below it.
export function subtreeIds(categories: Category[], id: number): Set<number> {
  const ids = new Set([id])
  // Sorted by path, so children always come after their parent: one pass is enough.
  for (const category of categories) {
    if (category.parent_id !== null && ids.has(category.parent_id)) ids.add(category.id)
  }
  return ids
}

// How many levels the category spans with its subcategories (1 when it has none).
export function heightOf(categories: Category[], id: number): number {
  const ids = subtreeIds(categories, id)
  const own = categories.find((category) => category.id === id)?.depth ?? 1
  const deepest = Math.max(
    ...categories.filter((category) => ids.has(category.id)).map((category) => category.depth),
    own,
  )
  return deepest - own + 1
}

// Where a category can go: active ones, never inside itself, and not so deep that it or
// its subcategories would pass the limit. Without one (a new category) it has height 1.
export function parentChoices(categories: Category[], moving?: Category): Category[] {
  const excluded = moving ? subtreeIds(categories, moving.id) : new Set<number>()
  const height = moving ? heightOf(categories, moving.id) : 1
  return categories.filter(
    (category) =>
      category.is_active && !excluded.has(category.id) && category.depth + height <= MAX_DEPTH,
  )
}

// "Furniture/Gaming chairs" and "Furniture / Gaming chairs" read the same.
export function normalizePath(typed: string): string {
  return typed
    .split('/')
    .map((part) => part.trim())
    .join(' / ')
}

export type NewCategoryPlan =
  | { name: string; parent: Category | null }
  // Why the typed text can't become a category, said instead of offering it.
  | { problem: string }

// What typing a path in the picker would create: the last part, under the category the
// rest names (or at the top level). Null when there's nothing to offer.
export function planNewCategory(categories: Category[], typed: string): NewCategoryPlan | null {
  const parts = typed.split('/').map((part) => part.trim())
  if (parts.some((part) => part === '')) return null
  const path = parts.join(' / ').toLowerCase()
  const existing = categories.find((category) => category.path.toLowerCase() === path)
  if (existing?.is_active) return null // already in the list
  if (existing) {
    return { problem: `“${existing.path}” is archived. Restore it on the Categories page.` }
  }

  const name = parts.at(-1)!
  if (name.length > 100) return { problem: 'A category name can be at most 100 characters.' }
  if (parts.length === 1) return { name, parent: null }
  const parentPath = parts.slice(0, -1).join(' / ').toLowerCase()
  const parent = categories.find(
    (category) => category.is_active && category.path.toLowerCase() === parentPath,
  )
  if (!parent) {
    return { problem: `There is no category “${parts.slice(0, -1).join(' / ')}” to put it under.` }
  }
  if (parent.depth >= MAX_DEPTH) {
    return { problem: `Categories can only nest ${MAX_DEPTH} levels deep.` }
  }
  return { name, parent }
}

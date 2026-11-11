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

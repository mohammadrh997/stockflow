export type List = { get: (key: string) => string; set: (key: string, value: string) => void }

// Read from the address: ?category=3, plus &subcategories=1 to take in everything below it.
export function categoryFilterParams(list: List) {
  const category = list.get('category')
  if (!category) return {}
  return {
    category_id: Number(category),
    include_subcategories: list.get('subcategories') === '1',
  }
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, type Schemas } from '@/api/client'
import { unwrap, unwrapWithTotal } from '@/api/errors'

export type Category = Schemas['CategoryRead']
export type CategoryCreate = Schemas['CategoryCreate']
export type CategoryUpdate = Schemas['CategoryUpdate']

// The server allows this many levels; deeper choices aren't offered.
export const MAX_DEPTH = 5

// The whole tree, sorted the way it reads ("Furniture", "Furniture / Chairs", ...).
// Categories are few, so one request serves every picker and name on a page.
export function useCategories(includeArchived = false) {
  return useQuery({
    queryKey: ['categories', { includeArchived }],
    queryFn: () =>
      unwrap(api.GET('/categories', { params: { query: { include_archived: includeArchived } } })),
    staleTime: 60_000,
  })
}

function useInvalidateCategories() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['categories'] })
}

export function useCreateCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: (body: CategoryCreate) => unwrap(api.POST('/categories', { body })),
    onSuccess: invalidate,
  })
}

export function useUpdateCategory(id: number) {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: (body: CategoryUpdate) =>
      unwrap(
        api.PATCH('/categories/{category_id}', { params: { path: { category_id: id } }, body }),
      ),
    onSuccess: invalidate,
  })
}

export function useSetCategoryActive(id: number) {
  const invalidate = useInvalidateCategories()
  const params = { path: { category_id: id } }
  return useMutation({
    mutationFn: (active: boolean) =>
      unwrap(
        active
          ? api.POST('/categories/{category_id}/unarchive', { params })
          : api.POST('/categories/{category_id}/archive', { params }),
      ),
    onSuccess: invalidate,
  })
}

// How many active products sit in a category: directly, or with its subcategories too.
export function useCategoryProductCount(id: number, includeSubcategories: boolean) {
  return useQuery({
    // Under 'products', so adding or moving a product refreshes it.
    queryKey: ['products', 'count-in-category', id, includeSubcategories],
    queryFn: async () =>
      (
        await unwrapWithTotal(
          api.GET('/products', {
            params: {
              query: { category_id: id, include_subcategories: includeSubcategories, limit: 1 },
            },
          }),
        )
      ).total,
  })
}

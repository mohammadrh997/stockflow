import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, type Schemas } from '@/api/client'
import { unwrap, unwrapWithTotal } from '@/api/errors'
import type { ProductFormValues } from '@/features/products/ProductForm'

// An item on a supplier's bill that purchase asked inventory to create a product for.
export type MissingProduct = Schemas['MissingProductRead']

export function useMissingProducts(
  params: { skip: number; limit: number },
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ['missing-products', params],
    queryFn: () => unwrapWithTotal(api.GET('/missing-products', { params: { query: params } })),
    placeholderData: keepPreviousData,
    enabled: options.enabled,
  })
}

// Creates the product and puts it on the item in one go, so purchase sees it on its import.
export function useCreateProductForItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ item, values }: { item: MissingProduct; values: ProductFormValues }) =>
      unwrap(
        api.POST('/missing-products/{line_id}/product', {
          params: { path: { line_id: item.id } },
          body: values,
        }),
      ),
    onSuccess: (product, { item }) => {
      queryClient.setQueryData(['product', product.id], product)
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['missing-products'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['bill-import', item.bill_import.id] }),
        queryClient.invalidateQueries({ queryKey: ['bill-imports'] }),
      ])
    },
    // Purchase may have chosen a product, or confirmed the import, meanwhile.
    onError: () => queryClient.invalidateQueries({ queryKey: ['missing-products'] }),
  })
}

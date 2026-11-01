import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, type Schemas } from '@/api/client'
import { unwrap } from '@/api/errors'

export type Product = Schemas['ProductRead']
export type ProductCreate = Schemas['ProductCreate']
export type ProductUpdate = Schemas['ProductUpdate']

export type ProductListParams = {
  name?: string
  include_archived?: boolean
  skip: number
  limit: number
}

export function useProducts(params: ProductListParams) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => unwrap(api.GET('/products', { params: { query: params } })),
    placeholderData: keepPreviousData,
  })
}

export function useProduct(id: number) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: () =>
      unwrap(api.GET('/products/{product_id}', { params: { path: { product_id: id } } })),
  })
}

function useStoreProduct() {
  const queryClient = useQueryClient()
  return (product: Product) => {
    queryClient.setQueryData(['product', product.id], product)
    return queryClient.invalidateQueries({ queryKey: ['products'] })
  }
}

export function useCreateProduct() {
  const store = useStoreProduct()
  return useMutation({
    mutationFn: (body: ProductCreate) => unwrap(api.POST('/products', { body })),
    onSuccess: store,
  })
}

export function useUpdateProduct(id: number) {
  const store = useStoreProduct()
  return useMutation({
    mutationFn: (body: ProductUpdate) =>
      unwrap(api.PATCH('/products/{product_id}', { params: { path: { product_id: id } }, body })),
    onSuccess: store,
  })
}

export function useSetProductArchived(id: number) {
  const store = useStoreProduct()
  return useMutation({
    mutationFn: (archived: boolean) => {
      const params = { path: { product_id: id } }
      return unwrap(
        archived
          ? api.POST('/products/{product_id}/archive', { params })
          : api.POST('/products/{product_id}/unarchive', { params }),
      )
    },
    onSuccess: store,
  })
}

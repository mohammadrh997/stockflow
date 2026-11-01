import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, type Schemas } from '@/api/client'
import { unwrap } from '@/api/errors'
import type { LineChanges, NewLine } from '@/features/orders/types'

export type PurchaseOrder = Schemas['PurchaseOrderRead']
export type PurchaseState = Schemas['PurchaseState']

export type PurchaseOrderListParams = {
  state?: PurchaseState
  partner_id?: number
  skip: number
  limit: number
}

export function usePurchaseOrders(params: PurchaseOrderListParams) {
  return useQuery({
    queryKey: ['purchase-orders', params],
    queryFn: () => unwrap(api.GET('/purchase-orders', { params: { query: params } })),
    placeholderData: keepPreviousData,
  })
}

export function usePurchaseOrder(id: number) {
  return useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () =>
      unwrap(api.GET('/purchase-orders/{order_id}', { params: { path: { order_id: id } } })),
  })
}

// Every order endpoint returns the whole updated order: cache it, refresh the lists.
function useStoreOrder() {
  const queryClient = useQueryClient()
  return (order: PurchaseOrder) => {
    queryClient.setQueryData(['purchase-order', order.id], order)
    return queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
  }
}

export function useCreatePurchaseOrder() {
  const store = useStoreOrder()
  return useMutation({
    mutationFn: (body: Schemas['PurchaseOrderCreate']) =>
      unwrap(api.POST('/purchase-orders', { body })),
    onSuccess: store,
  })
}

export function useUpdatePurchaseOrder(id: number) {
  const store = useStoreOrder()
  return useMutation({
    mutationFn: (body: Schemas['PurchaseOrderUpdate']) =>
      unwrap(
        api.PATCH('/purchase-orders/{order_id}', { params: { path: { order_id: id } }, body }),
      ),
    onSuccess: store,
  })
}

export function usePurchaseOrderLines(id: number) {
  const store = useStoreOrder()
  const add = useMutation({
    mutationFn: (line: NewLine) =>
      unwrap(
        api.POST('/purchase-orders/{order_id}/lines', {
          params: { path: { order_id: id } },
          body: line,
        }),
      ),
    onSuccess: store,
  })
  const update = useMutation({
    mutationFn: ({ lineId, changes }: { lineId: number; changes: LineChanges }) =>
      unwrap(
        api.PATCH('/purchase-orders/{order_id}/lines/{line_id}', {
          params: { path: { order_id: id, line_id: lineId } },
          body: changes,
        }),
      ),
    onSuccess: store,
  })
  const remove = useMutation({
    mutationFn: (lineId: number) =>
      unwrap(
        api.DELETE('/purchase-orders/{order_id}/lines/{line_id}', {
          params: { path: { order_id: id, line_id: lineId } },
        }),
      ),
    onSuccess: store,
  })
  return { add, update, remove }
}

// Confirming creates a receipt and cancelling cancels it, so transfers change too.
export function usePurchaseOrderAction(id: number, action: 'confirm' | 'cancel') {
  const store = useStoreOrder()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => {
      const params = { path: { order_id: id } }
      return unwrap(
        action === 'confirm'
          ? api.POST('/purchase-orders/{order_id}/confirm', { params })
          : api.POST('/purchase-orders/{order_id}/cancel', { params }),
      )
    },
    onSuccess: async (order) => {
      await store(order)
      await queryClient.invalidateQueries({ queryKey: ['transfers'] })
    },
  })
}

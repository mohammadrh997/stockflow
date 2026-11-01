import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, type Schemas } from '@/api/client'
import { unwrap } from '@/api/errors'
import type { LineChanges, NewLine } from '@/features/orders/types'

export type SalesOrder = Schemas['SalesOrderRead']
export type SalesState = Schemas['SalesState']

export type SalesOrderListParams = {
  state?: SalesState
  partner_id?: number
  skip: number
  limit: number
}

export function useSalesOrders(params: SalesOrderListParams) {
  return useQuery({
    queryKey: ['sales-orders', params],
    queryFn: () => unwrap(api.GET('/sales-orders', { params: { query: params } })),
    placeholderData: keepPreviousData,
  })
}

export function useSalesOrder(id: number) {
  return useQuery({
    queryKey: ['sales-order', id],
    queryFn: () =>
      unwrap(api.GET('/sales-orders/{order_id}', { params: { path: { order_id: id } } })),
  })
}

// Every order endpoint returns the whole updated order: cache it, refresh the lists.
function useStoreOrder() {
  const queryClient = useQueryClient()
  return (order: SalesOrder) => {
    queryClient.setQueryData(['sales-order', order.id], order)
    return queryClient.invalidateQueries({ queryKey: ['sales-orders'] })
  }
}

export function useCreateSalesOrder() {
  const store = useStoreOrder()
  return useMutation({
    mutationFn: (body: Schemas['SalesOrderCreate']) => unwrap(api.POST('/sales-orders', { body })),
    onSuccess: store,
  })
}

export function useUpdateSalesOrder(id: number) {
  const store = useStoreOrder()
  return useMutation({
    mutationFn: (body: Schemas['SalesOrderUpdate']) =>
      unwrap(api.PATCH('/sales-orders/{order_id}', { params: { path: { order_id: id } }, body })),
    onSuccess: store,
  })
}

export function useSalesOrderLines(id: number) {
  const store = useStoreOrder()
  const add = useMutation({
    mutationFn: (line: NewLine) =>
      unwrap(
        api.POST('/sales-orders/{order_id}/lines', {
          params: { path: { order_id: id } },
          body: line,
        }),
      ),
    onSuccess: store,
  })
  const update = useMutation({
    mutationFn: ({ lineId, changes }: { lineId: number; changes: LineChanges }) =>
      unwrap(
        api.PATCH('/sales-orders/{order_id}/lines/{line_id}', {
          params: { path: { order_id: id, line_id: lineId } },
          body: changes,
        }),
      ),
    onSuccess: store,
  })
  const remove = useMutation({
    mutationFn: (lineId: number) =>
      unwrap(
        api.DELETE('/sales-orders/{order_id}/lines/{line_id}', {
          params: { path: { order_id: id, line_id: lineId } },
        }),
      ),
    onSuccess: store,
  })
  return { add, update, remove }
}

// Confirming creates a delivery and reserves stock; cancelling undoes both.
export function useSalesOrderAction(id: number, action: 'confirm' | 'cancel') {
  const store = useStoreOrder()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => {
      const params = { path: { order_id: id } }
      return unwrap(
        action === 'confirm'
          ? api.POST('/sales-orders/{order_id}/confirm', { params })
          : api.POST('/sales-orders/{order_id}/cancel', { params }),
      )
    },
    onSuccess: async (order) => {
      await store(order)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transfers'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
      ])
    },
  })
}

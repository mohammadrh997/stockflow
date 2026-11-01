import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, type Schemas } from '@/api/client'
import { unwrap } from '@/api/errors'

export type Transfer = Schemas['TransferRead']
export type TransferType = Schemas['TransferType']
export type TransferState = Schemas['TransferState']
export type StockMove = Schemas['StockMoveRead']

export const TRANSFER_TYPE_LABELS: Record<TransferType, string> = {
  receipt: 'Receipt',
  delivery: 'Delivery',
  internal: 'Internal',
  adjustment: 'Adjustment',
}

export type TransferListParams = {
  transfer_type?: TransferType
  state?: TransferState
  warehouse_id?: number
  purchase_order_id?: number
  sales_order_id?: number
  skip?: number
  limit?: number
}

export function useTransfers(params: TransferListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['transfers', params],
    queryFn: () => unwrap(api.GET('/transfers', { params: { query: params } })),
    placeholderData: keepPreviousData,
    enabled: options.enabled,
  })
}

export function useTransfer(id: number) {
  return useQuery({
    queryKey: ['transfer', id],
    queryFn: () =>
      unwrap(api.GET('/transfers/{transfer_id}', { params: { path: { transfer_id: id } } })),
  })
}

// Moving stock changes the stock report, and validating a receipt or delivery also moves its order on.
function useStoreTransfer() {
  const queryClient = useQueryClient()
  return (transfer: Transfer) => {
    queryClient.setQueryData(['transfer', transfer.id], transfer)
    return Promise.all(
      [
        'transfers',
        'stock',
        'purchase-order',
        'purchase-orders',
        'sales-order',
        'sales-orders',
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    )
  }
}

export function useValidateTransfer(id: number) {
  const store = useStoreTransfer()
  return useMutation({
    mutationFn: (locationId: number | null) =>
      unwrap(
        api.POST('/transfers/{transfer_id}/validate', {
          params: { path: { transfer_id: id } },
          body: { location_id: locationId },
        }),
      ),
    onSuccess: store,
  })
}

export function useCreateInternalTransfer() {
  const store = useStoreTransfer()
  return useMutation({
    mutationFn: (body: Schemas['InternalTransferCreate']) =>
      unwrap(api.POST('/transfers/internal', { body })),
    onSuccess: store,
  })
}

export function useCreateAdjustment() {
  const store = useStoreTransfer()
  return useMutation({
    mutationFn: (body: Schemas['AdjustmentCreate']) =>
      unwrap(api.POST('/transfers/adjustments', { body })),
    onSuccess: store,
  })
}

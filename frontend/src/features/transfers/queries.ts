import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { api, type Schemas } from '@/api/client'
import { unwrap } from '@/api/errors'

export type Transfer = Schemas['TransferRead']
export type TransferType = Schemas['TransferType']
export type TransferState = Schemas['TransferState']

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

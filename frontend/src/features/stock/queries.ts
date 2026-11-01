import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { api, type Schemas } from '@/api/client'
import { unwrap } from '@/api/errors'

export type StockRow = Schemas['StockRow']

export type StockParams = {
  warehouse_id?: number
  product_id?: number
}

export function useStock(params: StockParams) {
  return useQuery({
    queryKey: ['stock', params],
    queryFn: () => unwrap(api.GET('/stock', { params: { query: params } })),
    placeholderData: keepPreviousData,
  })
}

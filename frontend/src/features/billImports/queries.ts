import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, type Schemas } from '@/api/client'
import { unwrap, unwrapWithTotal } from '@/api/errors'
import { invalidateSummaries } from '@/api/summaries'
import { fileUpload } from '@/lib/imageUpload'

export type BillImport = Schemas['BillImportRead']
export type BillImportSummary = Schemas['BillImportSummary']
export type BillImportLine = Schemas['BillImportLineRead']
export type BillImportState = Schemas['BillImportState']
export type ImportWarning = Schemas['ImportWarning']

export type BillImportListParams = { state?: BillImportState; skip: number; limit: number }

export function useBillImports(params: BillImportListParams) {
  return useQuery({
    queryKey: ['bill-imports', params],
    queryFn: () => unwrapWithTotal(api.GET('/bill-imports', { params: { query: params } })),
    placeholderData: keepPreviousData,
  })
}

export function useBillImport(id: number) {
  return useQuery({
    queryKey: ['bill-import', id],
    queryFn: () =>
      unwrap(api.GET('/bill-imports/{import_id}', { params: { path: { import_id: id } } })),
  })
}

// Every change returns the whole import, warnings included: cache it, refresh the list.
function useStoreImport() {
  const queryClient = useQueryClient()
  return (bill: BillImport) => {
    queryClient.setQueryData(['bill-import', bill.id], bill)
    return queryClient.invalidateQueries({ queryKey: ['bill-imports'] })
  }
}

// Sends the file to be read. It can take several seconds: the model reads the whole bill.
export function useImportBill() {
  const store = useStoreImport()
  return useMutation({
    mutationFn: (file: File) => unwrap(api.POST('/bill-imports', fileUpload(file))),
    onSuccess: store,
  })
}

export function useUpdateImport(id: number) {
  const store = useStoreImport()
  return useMutation({
    mutationFn: (body: Schemas['BillImportUpdate']) =>
      unwrap(api.PATCH('/bill-imports/{import_id}', { params: { path: { import_id: id } }, body })),
    onSuccess: store,
  })
}

export function useImportLines(id: number) {
  const store = useStoreImport()
  const update = useMutation({
    mutationFn: ({ lineId, ...body }: { lineId: number } & Schemas['BillImportLineUpdate']) =>
      unwrap(
        api.PATCH('/bill-imports/{import_id}/lines/{line_id}', {
          params: { path: { import_id: id, line_id: lineId } },
          body,
        }),
      ),
    onSuccess: store,
  })
  const remove = useMutation({
    mutationFn: (lineId: number) =>
      unwrap(
        api.DELETE('/bill-imports/{import_id}/lines/{line_id}', {
          params: { path: { import_id: id, line_id: lineId } },
        }),
      ),
    onSuccess: store,
  })
  return { update, remove }
}

// Confirming makes a draft purchase order, so the orders and the totals above partners
// and products change too.
export function useFinishImport(id: number) {
  const store = useStoreImport()
  const queryClient = useQueryClient()
  const params = { path: { import_id: id } }
  const confirm = useMutation({
    mutationFn: () => unwrap(api.POST('/bill-imports/{import_id}/confirm', { params })),
    onSuccess: (bill: BillImport) =>
      Promise.all([
        store(bill),
        queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }),
        invalidateSummaries(queryClient),
      ]),
  })
  const discard = useMutation({
    mutationFn: () => unwrap(api.POST('/bill-imports/{import_id}/discard', { params })),
    onSuccess: store,
  })
  return { confirm, discard }
}

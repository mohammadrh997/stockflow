import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, type Schemas } from '@/api/client'
import { unwrap } from '@/api/errors'
import { invalidateSummaries } from '@/api/summaries'

export type Invoice = Schemas['InvoiceRead']
export type InvoiceLine = Schemas['InvoiceLineRead']
export type InvoiceType = Schemas['InvoiceType']
export type InvoiceState = Schemas['InvoiceState']
export type PaymentState = Schemas['PaymentState']

export const INVOICE_TYPE_LABELS: Record<InvoiceType, { one: string; many: string }> = {
  customer_invoice: { one: 'Customer invoice', many: 'Customer invoices' },
  vendor_bill: { one: 'Vendor bill', many: 'Vendor bills' },
}

export type InvoiceListParams = {
  invoice_type?: InvoiceType
  state?: InvoiceState
  partner_id?: number
  purchase_order_id?: number
  sales_order_id?: number
  skip?: number
  limit?: number
}

export function useInvoices(params: InvoiceListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['invoices', params],
    queryFn: () => unwrap(api.GET('/invoices', { params: { query: params } })),
    placeholderData: keepPreviousData,
    enabled: options.enabled,
  })
}

export function useInvoice(id: number) {
  return useQuery({
    queryKey: ['invoice', id],
    queryFn: () =>
      unwrap(api.GET('/invoices/{invoice_id}', { params: { path: { invoice_id: id } } })),
  })
}

// Every invoice endpoint returns the whole invoice: cache it, refresh the lists.
function useStoreInvoice() {
  const queryClient = useQueryClient()
  return (invoice: Invoice) => {
    queryClient.setQueryData(['invoice', invoice.id], invoice)
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['invoices'] }),
      invalidateSummaries(queryClient),
    ])
  }
}

export function useCreateInvoice() {
  const store = useStoreInvoice()
  return useMutation({
    mutationFn: (body: Schemas['InvoiceCreate']) => unwrap(api.POST('/invoices', { body })),
    onSuccess: store,
  })
}

export function useInvoiceLines(id: number) {
  const store = useStoreInvoice()
  const update = useMutation({
    mutationFn: ({ lineId, changes }: { lineId: number; changes: Schemas['InvoiceLineUpdate'] }) =>
      unwrap(
        api.PATCH('/invoices/{invoice_id}/lines/{line_id}', {
          params: { path: { invoice_id: id, line_id: lineId } },
          body: changes,
        }),
      ),
    onSuccess: store,
  })
  const remove = useMutation({
    mutationFn: (lineId: number) =>
      unwrap(
        api.DELETE('/invoices/{invoice_id}/lines/{line_id}', {
          params: { path: { invoice_id: id, line_id: lineId } },
        }),
      ),
    onSuccess: store,
  })
  return { update, remove }
}

export function usePostInvoice(id: number) {
  const store = useStoreInvoice()
  return useMutation({
    mutationFn: (body: Schemas['InvoicePost']) =>
      unwrap(
        api.POST('/invoices/{invoice_id}/post', { params: { path: { invoice_id: id } }, body }),
      ),
    onSuccess: store,
  })
}

export function useCancelInvoice(id: number) {
  const store = useStoreInvoice()
  return useMutation({
    mutationFn: () =>
      unwrap(api.POST('/invoices/{invoice_id}/cancel', { params: { path: { invoice_id: id } } })),
    onSuccess: store,
  })
}

export function useRegisterPayment(id: number) {
  const store = useStoreInvoice()
  return useMutation({
    mutationFn: (body: Schemas['PaymentCreate']) =>
      unwrap(
        api.POST('/invoices/{invoice_id}/payments', {
          params: { path: { invoice_id: id } },
          body,
        }),
      ),
    onSuccess: store,
  })
}

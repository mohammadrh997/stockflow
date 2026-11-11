import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, type Schemas } from '@/api/client'
import { unwrap } from '@/api/errors'
import { fileUpload } from '@/lib/imageUpload'

export type Company = Schemas['CompanyRead']
export type CompanyUpdate = Schemas['CompanyUpdate']
export type Currency = Schemas['Currency']

const companyKey = ['company']

// Any signed-in user can read it; it hardly ever changes, so it isn't refetched on its own.
export function useCompany() {
  return useQuery({
    queryKey: companyKey,
    queryFn: () => unwrap(api.GET('/settings/company')),
    staleTime: Infinity,
  })
}

// The currency code, e.g. "USD", or undefined until the company has loaded.
export function useCurrency(): Currency | undefined {
  return useCompany().data?.currency
}

// A money column's heading with the currency, as on the PDFs: "Total (USD)".
export function moneyHeading(label: string, currency: string | undefined): string {
  return currency ? `${label} (${currency})` : label
}

function useStoreCompany() {
  const queryClient = useQueryClient()
  return (company: Company) => queryClient.setQueryData(companyKey, company)
}

export function useUpdateCompany() {
  const store = useStoreCompany()
  return useMutation({
    mutationFn: (body: CompanyUpdate) => unwrap(api.PATCH('/settings/company', { body })),
    onSuccess: store,
  })
}

export function useCompanyLogo() {
  const store = useStoreCompany()
  const upload = useMutation({
    mutationFn: (file: File) => unwrap(api.PUT('/settings/company/logo', fileUpload(file))),
    onSuccess: store,
  })
  const remove = useMutation({
    mutationFn: () => unwrap(api.DELETE('/settings/company/logo')),
    onSuccess: store,
  })
  return { upload, remove }
}

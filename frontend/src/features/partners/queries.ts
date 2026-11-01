import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, type Schemas } from '@/api/client'
import { unwrap } from '@/api/errors'

export type Partner = Schemas['PartnerRead']
export type PartnerCreate = Schemas['PartnerCreate']
export type PartnerUpdate = Schemas['PartnerUpdate']

export type PartnerListParams = {
  name?: string
  is_customer?: boolean
  is_supplier?: boolean
  include_archived?: boolean
  skip: number
  limit: number
}

export function usePartners(params: PartnerListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['partners', params],
    queryFn: () => unwrap(api.GET('/partners', { params: { query: params } })),
    placeholderData: keepPreviousData,
    enabled: options.enabled,
  })
}

export function usePartner(id: number, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['partner', id],
    queryFn: () =>
      unwrap(api.GET('/partners/{partner_id}', { params: { path: { partner_id: id } } })),
    enabled: options.enabled,
  })
}

function useStorePartner() {
  const queryClient = useQueryClient()
  return (partner: Partner) => {
    queryClient.setQueryData(['partner', partner.id], partner)
    return queryClient.invalidateQueries({ queryKey: ['partners'] })
  }
}

export function useCreatePartner() {
  const store = useStorePartner()
  return useMutation({
    mutationFn: (body: PartnerCreate) => unwrap(api.POST('/partners', { body })),
    onSuccess: store,
  })
}

export function useUpdatePartner(id: number) {
  const store = useStorePartner()
  return useMutation({
    mutationFn: (body: PartnerUpdate) =>
      unwrap(api.PATCH('/partners/{partner_id}', { params: { path: { partner_id: id } }, body })),
    onSuccess: store,
  })
}

export function useSetPartnerArchived(id: number) {
  const store = useStorePartner()
  return useMutation({
    mutationFn: (archived: boolean) => {
      const params = { path: { partner_id: id } }
      return unwrap(
        archived
          ? api.POST('/partners/{partner_id}/archive', { params })
          : api.POST('/partners/{partner_id}/unarchive', { params }),
      )
    },
    onSuccess: store,
  })
}

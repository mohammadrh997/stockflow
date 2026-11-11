import { useQuery } from '@tanstack/react-query'

import { api, type Schemas } from '@/api/client'
import { unwrap } from '@/api/errors'

export type PartnerSummary = Schemas['PartnerSummary']

// A partner's order and invoice totals, added up by the server. Each part is null when
// the user can't see that area (sales figures for sales users, purchase for purchase).
export function usePartnerSummary(partnerId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['partners', partnerId, 'summary'],
    queryFn: () =>
      unwrap(
        api.GET('/partners/{partner_id}/summary', { params: { path: { partner_id: partnerId } } }),
      ),
    enabled,
  })
}

import type { QueryClient } from '@tanstack/react-query'

// The totals above a product or a partner, added up by the server from orders, invoices
// and transfers. They live under one key so that any change to those refreshes them all.
export const summaryKey = (kind: 'product' | 'partner', id: number) => ['summaries', kind, id]

export function invalidateSummaries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ['summaries'] })
}

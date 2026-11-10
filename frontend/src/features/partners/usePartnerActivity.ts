import { useQuery } from '@tanstack/react-query'

import { api } from '@/api/client'
import { unwrap } from '@/api/errors'
import type { InvoiceType } from '@/features/invoices/queries'
import { fromThousandths, toThousandths } from '@/lib/quantity'

// The API's largest page, and a stop for a very long history (3,000 records).
const PAGE = 100
const MAX_PAGES = 30

// The lists have no totals, so every page of this partner's records is fetched and added up.
async function fetchAll<T>(fetchPage: (skip: number) => Promise<T[]>) {
  const rows: T[] = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await fetchPage(page * PAGE)
    rows.push(...batch)
    if (batch.length < PAGE) return { rows, partial: false }
  }
  return { rows, partial: true }
}

function sum(values: string[]): string {
  return fromThousandths(values.reduce((total, value) => total + toThousandths(value), 0n))
}

export type PartnerOrders = { count: number; total: string; partial: boolean }

// Orders that still count: everything but cancelled ones, drafts included.
export function usePartnerOrders(kind: 'sales' | 'purchase', partnerId: number, enabled: boolean) {
  return useQuery({
    // Under the order lists' key, so any change to those orders refreshes it.
    queryKey: [`${kind}-orders`, 'of-partner', partnerId],
    queryFn: async (): Promise<PartnerOrders> => {
      const query = (skip: number) => ({
        params: { query: { partner_id: partnerId, skip, limit: PAGE } },
      })
      // Only what both kinds of order share is needed here.
      const { rows, partial } = await fetchAll<{ state: string; total: string }>((skip) =>
        kind === 'sales'
          ? unwrap(api.GET('/sales-orders', query(skip)))
          : unwrap(api.GET('/purchase-orders', query(skip))),
      )
      const counted = rows.filter((order) => order.state !== 'cancelled')
      return { count: counted.length, total: sum(counted.map((o) => o.total)), partial }
    },
    enabled,
  })
}

export type PartnerInvoiced = { invoiced: string; due: string; partial: boolean }

// What was posted to this partner, and what is still unpaid on it.
export function usePartnerInvoiced(type: InvoiceType, partnerId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['invoices', 'of-partner', type, partnerId],
    queryFn: async (): Promise<PartnerInvoiced> => {
      const { rows, partial } = await fetchAll((skip) =>
        unwrap(
          api.GET('/invoices', {
            params: {
              query: {
                invoice_type: type,
                partner_id: partnerId,
                state: 'posted',
                skip,
                limit: PAGE,
              },
            },
          }),
        ),
      )
      return {
        invoiced: sum(rows.map((invoice) => invoice.amount_total ?? '0')),
        due: sum(rows.map((invoice) => invoice.amount_due)),
        partial,
      }
    },
    enabled,
  })
}

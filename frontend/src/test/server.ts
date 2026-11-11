import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

import type { Schemas } from '@/api/client'

export const API = 'http://api.test'

// Read on many pages for the currency; tests that care about it override this.
export const defaultCompany: Schemas['CompanyRead'] = {
  name: 'Acme',
  address: null,
  phone: null,
  email: null,
  currency: 'USD',
  logo_url: null,
  currency_locked: false,
}

export const server = setupServer(
  http.get(`${API}/settings/company`, () => HttpResponse.json(defaultCompany)),
  // The totals above products and partners: empty unless a test says otherwise.
  http.get(`${API}/products/:id/summary`, () =>
    HttpResponse.json({ stock: null, sales: null, purchases: null }),
  ),
  http.get(`${API}/partners/:id/summary`, () =>
    HttpResponse.json({
      sales_orders: null,
      purchase_orders: null,
      customer_invoices: null,
      vendor_bills: null,
    }),
  ),
)

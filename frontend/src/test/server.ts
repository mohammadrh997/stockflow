import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

export const API = 'http://api.test'

// Read on many pages for the currency; tests that care about it override this.
export const defaultCompany = {
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
)

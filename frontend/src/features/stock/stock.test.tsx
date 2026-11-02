import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { makeUser, renderApp, signInAs } from '@/test/renderApp'
import { API, server } from '@/test/server'

describe('stock report', () => {
  it('passes filters from the URL and shows warehouse names', async () => {
    let query: URLSearchParams | undefined
    server.use(
      http.get(`${API}/warehouses`, () =>
        HttpResponse.json([{ id: 2, name: 'North', code: 'N', default_location_id: 7 }]),
      ),
      http.get(`${API}/products/3`, () =>
        HttpResponse.json({
          id: 3,
          name: 'Desk',
          sku: 'DESK',
          sale_price: '50.00',
          cost_price: '30.00',
          image_key: null,
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
          created_by_id: 1,
        }),
      ),
      http.get(`${API}/stock`, ({ request }) => {
        query = new URL(request.url).searchParams
        return HttpResponse.json([
          {
            product_id: 3,
            sku: 'DESK',
            product_name: 'Desk',
            warehouse_id: 2,
            on_hand: '5.000',
            reserved: '7.000',
            available: '-2.000',
          },
        ])
      }),
    )
    signInAs(makeUser())
    renderApp('/stock?warehouse=2&product=3')

    const row = (await screen.findByRole('link', { name: 'Desk' })).closest('tr')!
    expect(query?.get('warehouse_id')).toBe('2')
    expect(query?.get('product_id')).toBe('3')
    expect(await within(row).findByText('North')).toBeInTheDocument()
    expect(within(row).getByText('-2')).toBeInTheDocument()
  })

  it('shows the empty state', async () => {
    server.use(
      http.get(`${API}/warehouses`, () => HttpResponse.json([])),
      http.get(`${API}/stock`, () => HttpResponse.json([])),
    )
    signInAs(makeUser())
    renderApp('/stock')

    expect(await screen.findByText('No stock recorded yet.')).toBeInTheDocument()
  })
})

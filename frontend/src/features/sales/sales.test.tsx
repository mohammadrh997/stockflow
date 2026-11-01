import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { makeUser, renderApp, signInAs } from '@/test/renderApp'
import { API, server } from '@/test/server'
import type { SalesOrder } from './queries'

function makeOrder(overrides: Partial<SalesOrder> = {}): SalesOrder {
  return {
    id: 8,
    reference: 'SO00008',
    partner_id: 6,
    warehouse_id: 1,
    state: 'draft',
    created_by_id: 1,
    created_at: '2026-01-01T10:00:00Z',
    lines: [
      { id: 21, product_id: 3, quantity: '4.000', unit_price: '50.00', subtotal: '200.00' },
      { id: 22, product_id: 4, quantity: '1.000', unit_price: '20.00', subtotal: '20.00' },
    ],
    total: '220.00',
    ...overrides,
  }
}

function product(id: number, name: string) {
  return {
    id,
    name,
    sku: name.toUpperCase(),
    sale_price: '50.00',
    cost_price: '30.00',
    image_key: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    created_by_id: 1,
  }
}

function mockApi(order: () => SalesOrder) {
  const stockRequests: URLSearchParams[] = []
  server.use(
    http.get(`${API}/sales-orders/8`, () => HttpResponse.json(order())),
    http.get(`${API}/warehouses`, () =>
      HttpResponse.json([{ id: 1, name: 'Main', code: 'WH', default_location_id: 4 }]),
    ),
    http.get(`${API}/partners/6`, () =>
      HttpResponse.json({
        id: 6,
        name: 'Globex',
        email: null,
        phone: null,
        address: null,
        is_customer: true,
        is_supplier: false,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        created_by_id: 1,
      }),
    ),
    http.get(`${API}/products/3`, () => HttpResponse.json(product(3, 'Desk'))),
    http.get(`${API}/products/4`, () => HttpResponse.json(product(4, 'Lamp'))),
    http.get(`${API}/transfers`, () => HttpResponse.json([])),
    http.get(`${API}/stock`, ({ request }) => {
      stockRequests.push(new URL(request.url).searchParams)
      return HttpResponse.json([
        {
          product_id: 3,
          sku: 'DESK',
          product_name: 'Desk',
          warehouse_id: 1,
          on_hand: '10.000',
          reserved: '3.000',
          available: '7.000',
        },
      ])
    }),
  )
  return stockRequests
}

const salesManager = makeUser({ sales_access: 'manager' })

describe('sales order page', () => {
  it('shows the available quantity in the order warehouse on each draft line', async () => {
    const stockRequests = mockApi(() => makeOrder())
    signInAs(makeUser({ sales_access: 'user' }))
    renderApp('/sales-orders/8')

    const deskRow = (await screen.findByRole('link', { name: 'Desk' })).closest('tr')!
    const lampRow = screen.getByRole('link', { name: 'Lamp' }).closest('tr')!
    expect(await within(deskRow).findByText('7 available in this warehouse')).toBeInTheDocument()
    expect(within(lampRow).getByText('0 available in this warehouse')).toHaveClass(
      'text-destructive',
    )
    expect(stockRequests[0].get('warehouse_id')).toBe('1')
    expect(screen.queryByRole('button', { name: 'Confirm order' })).not.toBeInTheDocument()
  })

  it('shows the shortage message from the server as it is', async () => {
    mockApi(() => makeOrder())
    const shortage = 'product 3: requested 4.000, available 2.000'
    server.use(
      http.post(`${API}/sales-orders/8/confirm`, () =>
        HttpResponse.json({ detail: shortage }, { status: 409 }),
      ),
    )
    signInAs(salesManager)
    renderApp('/sales-orders/8')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Confirm order' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Confirm order' }))

    expect(await within(dialog).findByText(shortage)).toBeInTheDocument()
  })

  it('refreshes stock after confirming and drops the hints', async () => {
    let state: SalesOrder['state'] = 'draft'
    mockApi(() => makeOrder({ state }))
    server.use(
      http.post(`${API}/sales-orders/8/confirm`, () => {
        state = 'confirmed'
        return HttpResponse.json(makeOrder({ state }))
      }),
    )
    signInAs(salesManager)
    const { queryClient } = renderApp('/sales-orders/8')
    const user = userEvent.setup()

    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    await screen.findByText('7 available in this warehouse')
    await user.click(screen.getByRole('button', { name: 'Confirm order' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Confirm order' }))

    expect(await screen.findByText('confirmed')).toBeInTheDocument()
    expect(screen.queryByText(/available in this warehouse/)).not.toBeInTheDocument()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['stock'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['transfers'] })
  })

  it('is forbidden without sales access', async () => {
    signInAs(makeUser({ purchase_access: 'manager' }))
    renderApp('/sales-orders/8')

    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument()
  })
})

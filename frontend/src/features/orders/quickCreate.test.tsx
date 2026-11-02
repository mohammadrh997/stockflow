import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { makeUser, renderApp, signInAs } from '@/test/renderApp'
import { API, server } from '@/test/server'

const warehouse = { id: 1, name: 'Main', code: 'WH', default_location_id: 4 }

function partner(id: number, name: string, role: 'customer' | 'supplier') {
  return {
    id,
    name,
    email: null,
    phone: null,
    address: null,
    is_customer: role === 'customer',
    is_supplier: role === 'supplier',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    created_by_id: 1,
  }
}

const stool = {
  id: 9,
  name: 'Stool',
  sku: 'ST-1',
  sale_price: '20.00',
  cost_price: '12.00',
  image_key: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  created_by_id: 1,
}

function mockDraftPurchaseOrder() {
  server.use(
    http.get(`${API}/warehouses`, () => HttpResponse.json([warehouse])),
    http.get(`${API}/partners/5`, () => HttpResponse.json(partner(5, 'Acme', 'supplier'))),
    http.get(`${API}/products`, () => HttpResponse.json([])),
    http.get(`${API}/purchase-orders/7`, () =>
      HttpResponse.json({
        id: 7,
        reference: 'PO00007',
        partner_id: 5,
        warehouse_id: 1,
        state: 'draft',
        created_by_id: 1,
        created_at: '2026-01-01T10:00:00Z',
        lines: [],
        total: '0',
      }),
    ),
  )
}

async function searchProduct(text: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('combobox', { name: 'Product' }))
  await user.type(await screen.findByPlaceholderText('Search products…'), text)
  return user
}

describe('creating a product from an order', () => {
  it('creates it with the cost price first and selects it on the line', async () => {
    mockDraftPurchaseOrder()
    let body: unknown
    server.use(
      http.post(`${API}/products`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(stool, { status: 201 })
      }),
    )
    signInAs(makeUser({ purchase_access: 'user', inventory_access: 'manager' }))
    renderApp('/purchase-orders/7')

    const user = await searchProduct('Stool')
    await user.click(await screen.findByRole('option', { name: /Create “Stool”/ }))

    const dialog = await screen.findByRole('dialog', { name: 'New product' })
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Stool')
    const prices = within(dialog)
      .getAllByLabelText(/price/)
      .map((input) => input.id)
    expect(prices).toEqual(['cost_price', 'sale_price'])

    await user.type(within(dialog).getByLabelText('SKU'), 'st-1')
    await user.type(within(dialog).getByLabelText('Cost price'), '12')
    await user.type(within(dialog).getByLabelText('Sale price'), '20')
    await user.click(within(dialog).getByRole('button', { name: 'Create product' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('combobox', { name: 'Product' })).toHaveTextContent('Stool')
    expect(body).toEqual({ name: 'Stool', sku: 'st-1', sale_price: '20', cost_price: '12' })
  })

  it('tells people who cannot create products who to ask', async () => {
    mockDraftPurchaseOrder()
    signInAs(makeUser({ purchase_access: 'user' }))
    renderApp('/purchase-orders/7')

    await searchProduct('Stool')

    expect(
      await screen.findByText('No products found. Ask an inventory manager to add it.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Create/ })).not.toBeInTheDocument()
  })
})

describe('creating a partner from an order', () => {
  it('creates a customer from a new sales order and selects it', async () => {
    let body: unknown
    server.use(
      http.get(`${API}/warehouses`, () => HttpResponse.json([warehouse])),
      http.get(`${API}/partners`, () => HttpResponse.json([])),
      http.get(`${API}/partners/12`, () => HttpResponse.json(partner(12, 'Globex', 'customer'))),
      http.post(`${API}/partners`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(partner(12, 'Globex', 'customer'), { status: 201 })
      }),
    )
    signInAs(makeUser({ sales_access: 'user' }))
    renderApp('/sales-orders/new')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('combobox', { name: 'Customer' }))
    await user.type(await screen.findByPlaceholderText('Search partners…'), 'Globex')
    await user.click(await screen.findByRole('option', { name: /Create “Globex”/ }))

    const dialog = await screen.findByRole('dialog', { name: 'New customer' })
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Globex')
    expect(within(dialog).getByRole('checkbox', { name: 'Customer' })).toBeChecked()
    await user.click(within(dialog).getByRole('button', { name: 'Create customer' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('combobox', { name: 'Customer' })).toHaveTextContent('Globex')
    expect(body).toMatchObject({ name: 'Globex', is_customer: true, is_supplier: false })
  })

  it('points to an existing partner with the other role instead of creating a duplicate', async () => {
    server.use(
      http.get(`${API}/warehouses`, () => HttpResponse.json([warehouse])),
      http.get(`${API}/partners`, ({ request }) =>
        HttpResponse.json(
          new URL(request.url).searchParams.has('is_customer')
            ? []
            : [partner(5, 'Acme', 'supplier')],
        ),
      ),
    )
    signInAs(makeUser({ sales_access: 'user' }))
    renderApp('/sales-orders/new')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('combobox', { name: 'Customer' }))
    await user.type(await screen.findByPlaceholderText('Search partners…'), 'acme')

    expect(
      await screen.findByText('“acme” exists with another role. Tick Show all partners to use it.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Create/ })).not.toBeInTheDocument()
  })
})

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { makeUser, renderApp, signInAs } from '@/test/renderApp'
import { API, server } from '@/test/server'
import type { MissingProduct } from './queries'

const manager = makeUser({ inventory_access: 'manager' })

function item(overrides: Partial<MissingProduct> = {}): MissingProduct {
  return {
    id: 22,
    description: 'Monitor arm, dual',
    product_code: 'ma-2',
    quantity: '6.000',
    unit_price: '42.5',
    bill_import: {
      id: 2,
      supplier_name: 'ZAGROS FURNITURE WORKS LLC',
      partner_id: null,
      partner_reference: 'ZF-0917',
      file_type: null,
      products_requested_at: '2026-11-18T09:30:00Z',
      products_requested_by: { id: 4, name: 'Sara' },
    },
    ...overrides,
  }
}

function mockItems(items: MissingProduct[]) {
  server.use(
    http.get(`${API}/missing-products`, () =>
      HttpResponse.json(items, { headers: { 'X-Total-Count': String(items.length) } }),
    ),
    http.get(`${API}/categories`, () => HttpResponse.json([])),
  )
}

describe('products to create', () => {
  it('lists the items purchase asked for, under Products', async () => {
    mockItems([item()])
    signInAs(manager)
    renderApp('/missing-products')

    const row = (await screen.findByText('Monitor arm, dual')).closest('tr')!
    expect(row).toHaveTextContent('Code ma-2')
    expect(row).toHaveTextContent('ZAGROS FURNITURE WORKS LLC')
    expect(row).toHaveTextContent('Bill ZF-0917')
    expect(row).toHaveTextContent('by Sara')
    // No file kept: nothing to view.
    expect(within(row).queryByRole('button', { name: 'View bill' })).not.toBeInTheDocument()
    const [section] = screen.getAllByRole('navigation', { name: 'Section' })
    expect(within(section).getByRole('link', { name: 'To create' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('creates a product from the bill, and the item leaves the list', async () => {
    let items = [item()]
    let body: unknown
    server.use(
      http.get(`${API}/missing-products`, () =>
        HttpResponse.json(items, { headers: { 'X-Total-Count': String(items.length) } }),
      ),
      http.get(`${API}/categories`, () => HttpResponse.json([])),
      http.post(`${API}/missing-products/22/product`, async ({ request }) => {
        body = await request.json()
        items = []
        return HttpResponse.json(
          {
            id: 30,
            name: 'Monitor arm, dual',
            sku: 'MA-2',
            sale_price: '80.00',
            cost_price: '42.50',
            category_id: null,
            image_url: null,
            is_active: true,
            created_at: '2026-11-18T10:00:00Z',
            created_by: { id: 1, name: 'Admin' },
          },
          { status: 201 },
        )
      }),
    )
    signInAs(manager)
    renderApp('/missing-products')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Create product' }))
    const dialog = await screen.findByRole('dialog')
    // Filled in from the bill; the sale price is the manager's call.
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Monitor arm, dual')
    expect(within(dialog).getByLabelText('SKU')).toHaveValue('ma-2')
    expect(within(dialog).getByLabelText('Cost price')).toHaveValue('42.50')
    await user.type(within(dialog).getByLabelText('Sale price'), '80')
    await user.click(within(dialog).getByRole('button', { name: 'Create product' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(body).toMatchObject({ name: 'Monitor arm, dual', sale_price: '80', cost_price: '42.50' })
    expect(
      await screen.findByText('Nothing to create: no bill is waiting on a product.'),
    ).toBeInTheDocument()
  })

  it('says so when purchase already sorted the item out', async () => {
    mockItems([item()])
    server.use(
      http.post(`${API}/missing-products/22/product`, () =>
        HttpResponse.json({ detail: "this item doesn't need a product any more" }, { status: 409 }),
      ),
    )
    signInAs(manager)
    renderApp('/missing-products')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Create product' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Sale price'), '80')
    await user.click(within(dialog).getByRole('button', { name: 'Create product' }))

    expect(await within(dialog).findByText(/doesn't need a product any more/)).toBeInTheDocument()
  })

  it('is only for inventory managers', async () => {
    signInAs(makeUser({ inventory_access: 'user', purchase_access: 'manager' }))
    renderApp('/missing-products')

    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument()
  })

  it('shows on the start page for inventory managers', async () => {
    mockItems([item(), item({ id: 23, description: 'Desk lamp' })])
    signInAs(manager)
    renderApp('/')

    const card = await screen.findByRole('link', { name: /Products to create/ })
    await waitFor(() => expect(card).toHaveTextContent('2'))
    expect(card).toHaveAttribute('href', '/missing-products')
  })
})

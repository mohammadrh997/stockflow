import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { makeUser, renderApp, signInAs } from '@/test/renderApp'
import { API, server } from '@/test/server'
import type { PurchaseOrder } from './queries'

const line = {
  id: 11,
  product_id: 3,
  quantity: '2.000',
  unit_price: '30.00',
  subtotal: '60.00',
}

function makeOrder(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 7,
    reference: 'PO00007',
    partner_id: 5,
    warehouse_id: 1,
    state: 'draft',
    created_by: { id: 1, name: 'Admin' },
    created_at: '2026-01-01T10:00:00Z',
    lines: [line],
    total: '60.00',
    ...overrides,
  }
}

function mockReferenceData() {
  server.use(
    http.get(`${API}/warehouses`, () =>
      HttpResponse.json([{ id: 1, name: 'Main', code: 'WH', default_location_id: 4 }]),
    ),
    http.get(`${API}/partners/5`, () =>
      HttpResponse.json({
        id: 5,
        name: 'Acme',
        email: null,
        phone: null,
        address: null,
        is_customer: false,
        is_supplier: true,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        created_by: { id: 1, name: 'Admin' },
      }),
    ),
    http.get(`${API}/products/3`, () =>
      HttpResponse.json({
        id: 3,
        name: 'Desk',
        sku: 'DESK',
        sale_price: '50.00',
        cost_price: '30.00',
        image_url: null,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        created_by: { id: 1, name: 'Admin' },
      }),
    ),
    http.get(`${API}/transfers`, () => HttpResponse.json([])),
  )
}

const purchaseUser = makeUser({ purchase_access: 'user' })
const purchaseManager = makeUser({ purchase_access: 'manager' })

describe('purchase order page', () => {
  it('lets purchase users edit lines of a draft but not confirm it', async () => {
    mockReferenceData()
    server.use(http.get(`${API}/purchase-orders/7`, () => HttpResponse.json(makeOrder())))
    signInAs(purchaseUser)
    renderApp('/purchase-orders/7')

    const row = (await screen.findByRole('link', { name: 'Desk' })).closest('tr')!
    expect(within(row).getByRole('textbox', { name: 'Quantity for Desk' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Remove Desk' })).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Add line' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm order' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  })

  it('is read-only once confirmed', async () => {
    mockReferenceData()
    server.use(
      http.get(`${API}/purchase-orders/7`, () =>
        HttpResponse.json(makeOrder({ state: 'confirmed' })),
      ),
    )
    signInAs(purchaseManager)
    renderApp('/purchase-orders/7')

    const row = (await screen.findByRole('link', { name: 'Desk' })).closest('tr')!
    expect(within(row).queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Add line' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm order' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument()
  })

  it('confirms after the dialog and shows the new state', async () => {
    mockReferenceData()
    let confirmed = false
    server.use(
      http.get(`${API}/purchase-orders/7`, () =>
        HttpResponse.json(makeOrder({ state: confirmed ? 'confirmed' : 'draft' })),
      ),
      http.post(`${API}/purchase-orders/7/confirm`, () => {
        confirmed = true
        return HttpResponse.json(makeOrder({ state: 'confirmed' }))
      }),
    )
    signInAs(purchaseManager)
    renderApp('/purchase-orders/7')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Confirm order' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Confirm order' }))

    await waitFor(() => expect(confirmed).toBe(true))
    await waitFor(() =>
      expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('confirmed'),
    )
    expect(screen.queryByRole('form', { name: 'Add line' })).not.toBeInTheDocument()
  })

  it('shows the server refusing to confirm', async () => {
    mockReferenceData()
    server.use(
      http.get(`${API}/purchase-orders/7`, () => HttpResponse.json(makeOrder())),
      http.post(`${API}/purchase-orders/7/confirm`, () =>
        HttpResponse.json({ detail: 'Order is not Draft' }, { status: 409 }),
      ),
    )
    signInAs(purchaseManager)
    renderApp('/purchase-orders/7')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Confirm order' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Confirm order' }))

    expect(await within(dialog).findByText('Order is not Draft')).toBeInTheDocument()
  })

  it('disables Confirm with a reason when there are no lines', async () => {
    mockReferenceData()
    server.use(
      http.get(`${API}/purchase-orders/7`, () =>
        HttpResponse.json(makeOrder({ lines: [], total: '0' })),
      ),
    )
    signInAs(purchaseManager)
    renderApp('/purchase-orders/7')

    expect(await screen.findByRole('button', { name: 'Confirm order' })).toBeDisabled()
    expect(screen.getByLabelText('Add at least one line first.')).toBeInTheDocument()
  })

  it('edits a line in place and shows the order the server returns', async () => {
    mockReferenceData()
    let body: unknown
    server.use(
      http.get(`${API}/purchase-orders/7`, () => HttpResponse.json(makeOrder())),
      http.patch(`${API}/purchase-orders/7/lines/11`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(
          makeOrder({
            lines: [{ ...line, quantity: '5.000', subtotal: '150.00' }],
            total: '150.00',
          }),
        )
      }),
    )
    signInAs(purchaseUser)
    renderApp('/purchase-orders/7')
    const user = userEvent.setup()

    const quantity = await screen.findByRole('textbox', { name: 'Quantity for Desk' })
    await user.clear(quantity)
    await user.type(quantity, '5{Enter}')

    expect(await screen.findAllByText('150.00')).toHaveLength(2)
    expect(body).toEqual({ quantity: '5' })
    expect(screen.getByRole('textbox', { name: 'Quantity for Desk' })).toHaveValue('5')
  })

  it('checks an edited quantity before sending and undoes it with Escape', async () => {
    mockReferenceData()
    let patched = false
    server.use(
      http.get(`${API}/purchase-orders/7`, () => HttpResponse.json(makeOrder())),
      http.patch(`${API}/purchase-orders/7/lines/11`, () => {
        patched = true
        return HttpResponse.json(makeOrder())
      }),
    )
    signInAs(purchaseUser)
    renderApp('/purchase-orders/7')
    const user = userEvent.setup()

    const quantity = await screen.findByRole('textbox', { name: 'Quantity for Desk' })
    await user.clear(quantity)
    await user.type(quantity, '0{Enter}')

    expect(await screen.findByText('Must be more than 0.')).toBeInTheDocument()
    expect(quantity).toHaveAttribute('aria-invalid', 'true')

    await user.type(quantity, '{Escape}')
    expect(quantity).toHaveValue('2')
    expect(screen.queryByText('Must be more than 0.')).not.toBeInTheDocument()
    expect(patched).toBe(false)
  })

  it('shows the real default price and returns to the product picker after adding', async () => {
    mockReferenceData()
    let body: unknown
    server.use(
      http.get(`${API}/purchase-orders/7`, () => HttpResponse.json(makeOrder({ lines: [] }))),
      http.get(`${API}/products`, () =>
        HttpResponse.json([
          {
            id: 3,
            name: 'Desk',
            sku: 'DESK',
            sale_price: '50.00',
            cost_price: '30.00',
            image_url: null,
            is_active: true,
            created_at: '2026-01-01T00:00:00Z',
            created_by: { id: 1, name: 'Admin' },
          },
        ]),
      ),
      http.post(`${API}/purchase-orders/7/lines`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(makeOrder())
      }),
    )
    signInAs(purchaseUser)
    renderApp('/purchase-orders/7')
    const user = userEvent.setup()

    const picker = await screen.findByRole('combobox', { name: 'Product' })
    expect(screen.getByLabelText('Unit price')).toHaveAttribute('placeholder', 'Cost price')
    await user.click(picker)
    await user.click(await screen.findByRole('option', { name: /Desk/ }))
    await waitFor(() =>
      expect(screen.getByLabelText('Unit price')).toHaveAttribute(
        'placeholder',
        'Cost price: 30.00',
      ),
    )
    await user.type(screen.getByLabelText('Quantity'), '2')
    await user.click(screen.getByRole('button', { name: 'Add line' }))
    await waitFor(() => expect(picker).toHaveFocus())
    expect(body).toEqual({ product_id: 3, quantity: '2' })
  })

  it('shows a partly received order with its receipt history', async () => {
    mockReferenceData()
    const receipt = (overrides: object) => ({
      warehouse_id: 1,
      purchase_order_id: 7,
      sales_order_id: null,
      created_at: '2026-01-01T10:00:00Z',
      validated_at: null,
      validated_by: null,
      backorder_of_id: null,
      moves: [],
      ...overrides,
    })
    const tenDesks = { ...line, quantity: '10.000', subtotal: '300.00' }
    server.use(
      http.get(`${API}/purchase-orders/7`, () =>
        HttpResponse.json(makeOrder({ state: 'confirmed', lines: [tenDesks], total: '300.00' })),
      ),
      http.get(`${API}/transfers`, () =>
        HttpResponse.json([
          receipt({
            id: 22,
            reference: 'WH/IN/00008',
            state: 'ready',
            backorder_of_id: 21,
            lines: [
              {
                id: 2,
                product_id: 3,
                quantity: '6.000',
                purchase_line_id: 11,
                sales_line_id: null,
              },
            ],
          }),
          receipt({
            id: 21,
            reference: 'WH/IN/00007',
            state: 'done',
            lines: [
              {
                id: 1,
                product_id: 3,
                quantity: '4.000',
                purchase_line_id: 11,
                sales_line_id: null,
              },
            ],
          }),
        ]),
      ),
      http.get(`${API}/invoices`, () => HttpResponse.json([])),
    )
    signInAs(makeUser({ purchase_access: 'manager', inventory_access: 'user' }))
    renderApp('/purchase-orders/7')
    const user = userEvent.setup()

    expect(
      await screen.findByText('Partly received · the rest is on a backorder'),
    ).toBeInTheDocument()
    const row = screen.getByRole('link', { name: 'Desk' }).closest('tr')!
    expect(within(row).getByText('4')).toBeInTheDocument()
    // Received and invoiced.
    expect(within(row).getAllByText('of 10')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeDisabled()
    expect(
      screen.getByLabelText('Goods have already arrived. Cancel the backorder instead.'),
    ).toBeInTheDocument()

    // One receipt done, its backorder still waiting.
    const receipts = screen.getByRole('button', { name: /^2 receipts/ })
    expect(receipts).toHaveTextContent('1 waiting')
    await user.click(receipts)
    const history = await screen.findByRole('list', { name: 'Receipts' })
    const items = within(history).getAllByRole('link')
    expect(items.map((item) => item.getAttribute('href'))).toEqual([
      '/transfers/21',
      '/transfers/22',
    ])
    expect(within(history).getByText('Backorder of WH/IN/00007')).toBeInTheDocument()
  })

  it('links the receipt for people with inventory access', async () => {
    mockReferenceData()
    let transferQuery: URLSearchParams | undefined
    server.use(
      http.get(`${API}/purchase-orders/7`, () =>
        HttpResponse.json(makeOrder({ state: 'confirmed' })),
      ),
      http.get(`${API}/transfers`, ({ request }) => {
        transferQuery = new URL(request.url).searchParams
        return HttpResponse.json([
          {
            id: 21,
            reference: 'WH/IN/00007',
            transfer_type: 'receipt',
            state: 'ready',
            warehouse_id: 1,
            purchase_order_id: 7,
            sales_order_id: null,
            created_at: '2026-01-01T10:00:00Z',
            validated_at: null,
            validated_by: null,
            backorder_of_id: null,
            lines: [],
            moves: [],
          },
        ])
      }),
    )
    signInAs(makeUser({ purchase_access: 'user', inventory_access: 'user' }))
    renderApp('/purchase-orders/7')

    expect(await screen.findByRole('link', { name: /^1 receipt/ })).toHaveAttribute(
      'href',
      '/transfers/21',
    )
    expect(transferQuery?.get('purchase_order_id')).toBe('7')
  })

  it('is forbidden without purchase access', async () => {
    signInAs(makeUser({ sales_access: 'manager' }))
    renderApp('/purchase-orders/7')

    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument()
  })
})

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { PAGE_SIZE } from '@/lib/useListParams'
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
    partner_reference: null,
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
    expect(screen.getByLabelText('Unit price')).not.toHaveAttribute('placeholder')
    await user.click(picker)
    await user.click(await screen.findByRole('option', { name: /Desk/ }))
    await waitFor(() =>
      // The product's cost price, which the line gets if the field stays empty.
      expect(screen.getByLabelText('Unit price')).toHaveAttribute('placeholder', '30.00'),
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
    const receipts = screen.getByRole('button', { name: '2 receipts, 1 waiting' })
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

    expect(await screen.findByRole('link', { name: '1 receipt, 1 waiting' })).toHaveAttribute(
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

describe('supplier reference', () => {
  it('is edited with a draft, says a duplicate on the field, and clears when emptied', async () => {
    mockReferenceData()
    const bodies: unknown[] = []
    server.use(
      http.get(`${API}/purchase-orders/7`, () =>
        HttpResponse.json(makeOrder({ partner_reference: 'Q-1' })),
      ),
      http.patch(`${API}/purchase-orders/7`, async ({ request }) => {
        const body = (await request.json()) as { partner_reference: string | null }
        bodies.push(body)
        if (body.partner_reference === 'Q-2') {
          return HttpResponse.json(
            { detail: "this supplier's reference Q-2 is already on PO00003" },
            { status: 409 },
          )
        }
        return HttpResponse.json(makeOrder({ partner_reference: body.partner_reference }))
      }),
    )
    signInAs(purchaseUser)
    renderApp('/purchase-orders/7')
    const user = userEvent.setup()

    const reference = await screen.findByLabelText('Supplier reference')
    expect(reference).toHaveValue('Q-1')
    const save = screen.getByRole('button', { name: 'Save details' })
    expect(save).toBeDisabled()

    await user.clear(reference)
    await user.type(reference, 'Q-2')
    await user.click(save)
    expect(
      await screen.findByText("this supplier's reference Q-2 is already on PO00003"),
    ).toBeInTheDocument()
    expect(reference).toHaveAttribute('aria-invalid', 'true')

    await user.clear(reference)
    await user.click(save)
    await waitFor(() => expect(bodies.at(-1)).toMatchObject({ partner_reference: null }))
  })

  it('shows on a confirmed order and in the list', async () => {
    mockReferenceData()
    server.use(
      http.get(`${API}/purchase-orders/7`, () =>
        HttpResponse.json(makeOrder({ state: 'confirmed', partner_reference: 'Q-9' })),
      ),
      http.get(`${API}/invoices`, () => HttpResponse.json([])),
      http.get(`${API}/purchase-orders`, () =>
        HttpResponse.json([makeOrder({ partner_reference: 'Q-9' })], {
          headers: { 'X-Total-Count': '1' },
        }),
      ),
    )
    signInAs(purchaseManager)
    const { router } = renderApp('/purchase-orders/7')

    expect(await screen.findByText('Supplier reference')).toBeInTheDocument()
    expect(screen.getByText('Supplier reference').nextElementSibling).toHaveTextContent('Q-9')

    await router.navigate('/purchase-orders')
    expect(await screen.findByRole('columnheader', { name: 'Supplier ref.' })).toBeInTheDocument()
    expect(await screen.findByRole('cell', { name: 'Q-9' })).toBeInTheDocument()
  })
})

describe('an order made from a supplier bill', () => {
  it('links back to the bill it was imported from', async () => {
    mockReferenceData()
    let query: URLSearchParams | undefined
    server.use(
      http.get(`${API}/purchase-orders/7`, () =>
        HttpResponse.json(makeOrder({ state: 'confirmed', partner_reference: 'ZF-0917' })),
      ),
      http.get(`${API}/invoices`, () => HttpResponse.json([])),
      http.get(`${API}/bill-imports`, ({ request }) => {
        query = new URL(request.url).searchParams
        return HttpResponse.json(
          [
            {
              id: 2,
              state: 'done',
              supplier_name: 'ZAGROS FURNITURE WORKS LLC',
              partner_id: 5,
              partner_reference: 'ZF-0917',
              purchase_order_id: 7,
              created_at: '2026-11-17T10:00:00Z',
              created_by: { id: 1, name: 'Admin' },
              line_count: 3,
              missing_products: 0,
            },
          ],
          { headers: { 'X-Total-Count': '1' } },
        )
      }),
    )
    signInAs(purchaseManager)
    renderApp('/purchase-orders/7')

    expect(await screen.findByRole('link', { name: 'Bill ZF-0917' })).toHaveAttribute(
      'href',
      '/bill-imports/2',
    )
    expect(query?.get('purchase_order_id')).toBe('7')
    expect(screen.getByText('Imported from')).toBeInTheDocument()
  })

  it('says nothing about a source for an order made by hand', async () => {
    mockReferenceData()
    server.use(http.get(`${API}/purchase-orders/7`, () => HttpResponse.json(makeOrder())))
    signInAs(purchaseUser)
    renderApp('/purchase-orders/7')

    expect(await screen.findByRole('link', { name: 'Desk' })).toBeInTheDocument()
    expect(screen.queryByText('Imported from')).not.toBeInTheDocument()
  })
})

describe('stepping through the list an order came from', () => {
  // 30 received orders: a full first page, then the rest.
  const received = Array.from({ length: 30 }, (_, i) =>
    makeOrder({ id: i + 1, reference: `PO${String(i + 1).padStart(5, '0')}`, state: 'received' }),
  )

  function mockList() {
    const queries: URLSearchParams[] = []
    mockReferenceData()
    server.use(
      http.get(`${API}/invoices`, () => HttpResponse.json([])),
      http.get(`${API}/purchase-orders`, ({ request }) => {
        const params = new URL(request.url).searchParams
        queries.push(params)
        const skip = Number(params.get('skip') ?? 0)
        const limit = Number(params.get('limit'))
        return HttpResponse.json(received.slice(skip, skip + limit), {
          headers: { 'X-Total-Count': String(received.length) },
        })
      }),
      http.get(`${API}/purchase-orders/:id`, ({ params }) =>
        HttpResponse.json(received[Number(params.id) - 1]),
      ),
    )
    return queries
  }

  it('pages through the same filtered list, and leads back to it', async () => {
    const queries = mockList()
    signInAs(purchaseManager)
    const { router } = renderApp('/purchase-orders?state=received')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('link', { name: 'PO00002' }))
    const pager = await screen.findByRole('navigation', { name: 'Records' })
    expect(await within(pager).findByText('2 / 30')).toBeInTheDocument()
    expect(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', {
        name: 'Purchase orders',
      }),
    ).toHaveAttribute('href', '/purchase-orders?state=received')

    await user.click(within(pager).getByRole('button', { name: 'Next record' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/purchase-orders/3'))
    await user.click(screen.getByRole('button', { name: 'Previous record' }))
    await user.click(screen.getByRole('button', { name: 'Previous record' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/purchase-orders/1'))
    expect(screen.getByRole('button', { name: 'Previous record' })).toBeDisabled()
    // Every request kept the list's filter.
    expect(queries.every((query) => query.get('state') === 'received')).toBe(true)
  })

  it('carries on into the next page of the list', async () => {
    const queries = mockList()
    signInAs(purchaseManager)
    const { router } = renderApp('/purchase-orders?state=received')
    const user = userEvent.setup()

    const last = `PO${String(PAGE_SIZE).padStart(5, '0')}`
    await user.click(await screen.findByRole('link', { name: last }))
    expect(await screen.findByText(`${PAGE_SIZE} / 30`)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next record' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/purchase-orders/${PAGE_SIZE + 1}`),
    )
    expect(await screen.findByText(`${PAGE_SIZE + 1} / 30`)).toBeInTheDocument()
    expect(queries.some((query) => query.get('skip') === String(PAGE_SIZE))).toBe(true)
  })

  it('shows no pager on an order opened directly', async () => {
    mockList()
    signInAs(purchaseManager)
    renderApp('/purchase-orders/2')

    expect(await screen.findByRole('heading', { name: /PO00002/ })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Records' })).not.toBeInTheDocument()
  })
})

import { screen, waitFor, within } from '@testing-library/react'
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
    created_by: { id: 1, name: 'Admin' },
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
    image_url: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    created_by: { id: 1, name: 'Admin' },
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
        created_by: { id: 1, name: 'Admin' },
      }),
    ),
    http.get(`${API}/products/3`, () => HttpResponse.json(product(3, 'Desk'))),
    http.get(`${API}/products/4`, () => HttpResponse.json(product(4, 'Lamp'))),
    http.get(`${API}/transfers`, () => HttpResponse.json([])),
    http.get(`${API}/invoices`, () => HttpResponse.json([])),
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

    await waitFor(() =>
      expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('confirmed'),
    )
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

describe('invoicing a sales order', () => {
  const delivered = makeOrder({ state: 'delivered' })

  function delivery(quantities: Record<number, string>) {
    return {
      id: 31,
      reference: 'WH/OUT/00004',
      state: 'done',
      warehouse_id: 1,
      purchase_order_id: null,
      sales_order_id: 8,
      created_at: '2026-01-01T10:00:00Z',
      validated_at: '2026-01-02T10:00:00Z',
      validated_by: { id: 1, name: 'Admin' },
      backorder_of_id: null,
      moves: [],
      lines: Object.entries(quantities).map(([lineId, quantity], index) => ({
        id: index + 1,
        product_id: Number(lineId) === 21 ? 3 : 4,
        quantity,
        purchase_line_id: null,
        sales_line_id: Number(lineId),
      })),
    }
  }

  function invoice(id: number, state: string, quantities: Record<number, string>) {
    return {
      id,
      number: state === 'draft' ? null : `INV0000${id}`,
      invoice_type: 'customer_invoice',
      state,
      partner_id: 6,
      sales_order_id: 8,
      purchase_order_id: null,
      invoice_date: null,
      due_date: null,
      posted_at: null,
      posted_by: null,
      created_at: '2026-01-03T10:00:00Z',
      created_by: { id: 1, name: 'Admin' },
      amount_total: '0',
      amount_paid: '0',
      amount_due: '0',
      payment_state: 'not_paid',
      payments: [],
      lines: Object.entries(quantities).map(([lineId, quantity], index) => ({
        id: id * 10 + index,
        product_id: Number(lineId) === 21 ? 3 : 4,
        quantity,
        unit_price: '50.00',
        subtotal: '0',
        sales_line_id: Number(lineId),
        purchase_line_id: null,
      })),
    }
  }

  it('shows what is invoiced, ignoring cancelled invoices, and lists them', async () => {
    mockApi(() => delivered)
    server.use(
      http.get(`${API}/transfers`, () =>
        HttpResponse.json([delivery({ 21: '4.000', 22: '1.000' })]),
      ),
      http.get(`${API}/invoices`, () =>
        HttpResponse.json([
          invoice(2, 'posted', { 21: '3.000' }),
          invoice(1, 'cancelled', { 21: '4.000', 22: '1.000' }),
        ]),
      ),
    )
    signInAs(makeUser({ sales_access: 'user', inventory_access: 'user' }))
    renderApp('/sales-orders/8')
    const user = userEvent.setup()

    const desk = (await screen.findByRole('link', { name: 'Desk' })).closest('tr')!
    // Delivered 4 of 4; invoiced 3 of 4, as the cancelled invoice no longer counts.
    await waitFor(() =>
      expect(
        within(desk)
          .getAllByText(/of 4$/)
          .map((part) => part.parentElement?.textContent),
      ).toEqual(['4 of 4', '3 of 4']),
    )
    expect(screen.getByRole('button', { name: 'Create invoice' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '2 invoices, 0.00 posted' }))
    const list = await screen.findByRole('list', { name: 'Invoices' })
    const links = within(list).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/invoices/1', '/invoices/2'])
    expect(within(list).getByText('INV00002')).toBeInTheDocument()
  })

  it('says why there is nothing to invoice', async () => {
    mockApi(() => delivered)
    server.use(
      http.get(`${API}/transfers`, () =>
        HttpResponse.json([delivery({ 21: '4.000', 22: '1.000' })]),
      ),
      http.get(`${API}/invoices`, () =>
        HttpResponse.json([invoice(1, 'draft', { 21: '4.000', 22: '1.000' })]),
      ),
    )
    signInAs(makeUser({ sales_access: 'user', inventory_access: 'user' }))
    renderApp('/sales-orders/8')

    expect(
      await screen.findByLabelText('Everything delivered is already invoiced.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create invoice' })).toBeDisabled()
    expect(screen.getByRole('link', { name: '1 invoice, None posted yet' })).toHaveTextContent(
      'None posted yet',
    )
    expect(screen.getByRole('link', { name: '1 invoice, None posted yet' })).toHaveAttribute(
      'href',
      '/invoices/1',
    )
  })

  it('drafts an invoice and opens it', async () => {
    mockApi(() => delivered)
    let body: unknown
    const draft = invoice(3, 'draft', { 21: '4.000' })
    server.use(
      http.post(`${API}/invoices`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(draft, { status: 201 })
      }),
      http.get(`${API}/invoices/3`, () => HttpResponse.json(draft)),
    )
    // Without inventory access the page can't tell what moved, so the server decides.
    signInAs(makeUser({ sales_access: 'user' }))
    renderApp('/sales-orders/8')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Create invoice' }))

    expect(await screen.findByRole('heading', { name: /Draft #3/ })).toBeInTheDocument()
    expect(body).toEqual({ sales_order_id: 8 })
    // The breadcrumb leads back through the order.
    const trail = screen.getByRole('navigation', { name: /breadcrumb/i })
    expect(within(trail).getByRole('link', { name: 'SO00008' })).toHaveAttribute(
      'href',
      '/sales-orders/8',
    )
  })

  it('explains a refusal when nothing is left to invoice', async () => {
    mockApi(() => delivered)
    server.use(
      http.post(`${API}/invoices`, () => HttpResponse.json({ detail: 'SO00008' }, { status: 409 })),
    )
    signInAs(makeUser({ sales_access: 'user' }))
    renderApp('/sales-orders/8')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Create invoice' }))

    expect(await screen.findByText('Nothing left to invoice on SO00008.')).toBeInTheDocument()
  })

  it('is not offered on drafts', async () => {
    mockApi(() => makeOrder())
    signInAs(makeUser({ sales_access: 'manager', inventory_access: 'user' }))
    renderApp('/sales-orders/8')

    expect(await screen.findByRole('button', { name: 'Confirm order' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create invoice' })).not.toBeInTheDocument()
  })
})

describe('order PDF', () => {
  it('downloads from the More menu', async () => {
    mockApi(() => makeOrder({ state: 'confirmed' }))
    let requested = false
    server.use(
      http.get(`${API}/sales-orders/8/pdf`, () => {
        requested = true
        return new HttpResponse(new Blob(['%PDF-1.7']), {
          headers: { 'Content-Disposition': 'attachment; filename="SO00008.pdf"' },
        })
      }),
    )
    URL.createObjectURL = vi.fn(() => 'blob:pdf')
    URL.revokeObjectURL = vi.fn()
    const saved: string[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download)
    })
    signInAs(makeUser({ sales_access: 'user' }))
    renderApp('/sales-orders/8')
    const user = userEvent.setup()

    expect(screen.queryByRole('button', { name: 'Download PDF' })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Download PDF' }))

    await waitFor(() => expect(saved).toEqual(['SO00008.pdf']))
    expect(requested).toBe(true)
    click.mockRestore()
  })

  it('is not offered on a cancelled order', async () => {
    mockApi(() => makeOrder({ state: 'cancelled' }))
    signInAs(makeUser({ sales_access: 'user' }))
    renderApp('/sales-orders/8')

    expect(await screen.findByRole('heading', { name: /SO00008/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument()
  })
})

describe('sales order list', () => {
  it('names the currency in the Total heading, as on the PDFs', async () => {
    server.use(
      http.get(`${API}/sales-orders`, () =>
        HttpResponse.json([], { headers: { 'X-Total-Count': '0' } }),
      ),
      http.get(`${API}/warehouses`, () => HttpResponse.json([])),
    )
    signInAs(makeUser({ sales_access: 'user' }))
    renderApp('/sales-orders')

    expect(await screen.findByRole('columnheader', { name: 'Total (USD)' })).toBeInTheDocument()
  })
})

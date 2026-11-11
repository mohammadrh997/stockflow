import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { addDays, today } from '@/lib/dates'
import { makeUser, renderApp, signInAs } from '@/test/renderApp'
import { API, server } from '@/test/server'
import type { Invoice } from './queries'

const line = {
  id: 61,
  product_id: 3,
  quantity: '4.000',
  unit_price: '50.00',
  sales_line_id: 21,
  purchase_line_id: null,
  subtotal: '200.00',
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 5,
    number: null,
    invoice_type: 'customer_invoice',
    state: 'draft',
    partner_id: 6,
    sales_order_id: 8,
    purchase_order_id: null,
    invoice_date: null,
    due_date: null,
    posted_at: null,
    posted_by: null,
    created_at: '2026-11-01T10:00:00Z',
    created_by: { id: 1, name: 'Admin' },
    amount_total: '200.00',
    lines: [line],
    payments: [],
    amount_paid: '0',
    amount_due: '200.00',
    payment_state: 'not_paid',
    ...overrides,
  }
}

const posted = makeInvoice({
  number: 'INV00001',
  state: 'posted',
  invoice_date: '2026-10-01',
  due_date: '2026-10-31',
  posted_at: '2026-10-01T10:00:00Z',
})

function mockReferenceData() {
  server.use(
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
    http.get(`${API}/sales-orders/8`, () =>
      HttpResponse.json({
        id: 8,
        reference: 'SO00008',
        partner_id: 6,
        warehouse_id: 1,
        state: 'confirmed',
        created_by: { id: 1, name: 'Admin' },
        created_at: '2026-01-01T10:00:00Z',
        lines: [],
        total: '0',
      }),
    ),
  )
}

const salesUser = makeUser({ sales_access: 'user' })
const salesManager = makeUser({ sales_access: 'manager' })

describe('invoice list', () => {
  it('opens on customer invoices for sales users, with payment and overdue status', async () => {
    mockReferenceData()
    let query: URLSearchParams | undefined
    server.use(
      http.get(`${API}/invoices`, ({ request }) => {
        query = new URL(request.url).searchParams
        return HttpResponse.json([posted])
      }),
    )
    signInAs(salesUser)
    renderApp('/invoices')

    const row = (await screen.findByRole('link', { name: 'INV00001' })).closest('tr')!
    expect(query?.get('invoice_type')).toBe('customer_invoice')
    expect(screen.getByRole('heading', { name: 'Customer invoices' })).toBeInTheDocument()
    expect(
      await screen.findByRole('columnheader', { name: 'Amount due (USD)' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Total (USD)' })).toBeInTheDocument()
    const [section] = screen.getAllByRole('navigation', { name: 'Section' })
    expect(within(section).getByRole('link', { name: 'Invoices' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(row).getByText('Not paid')).toBeInTheDocument()
    expect(within(row).getByText('Overdue')).toBeInTheDocument()
    expect(await within(row).findByRole('link', { name: 'SO00008' })).toBeInTheDocument()
  })

  it('lets purchase users read customer invoices too, starting on their bills', async () => {
    mockReferenceData()
    const types: (string | null)[] = []
    server.use(
      http.get(`${API}/invoices`, ({ request }) => {
        types.push(new URL(request.url).searchParams.get('invoice_type'))
        return HttpResponse.json([])
      }),
    )
    signInAs(makeUser({ purchase_access: 'user' }))
    renderApp('/invoices')
    const user = userEvent.setup()

    expect(await screen.findByText('No vendor bills yet.')).toBeInTheDocument()
    expect(types[0]).toBe('vendor_bill')
    const [section] = screen.getAllByRole('navigation', { name: 'Section' })
    expect(within(section).getByRole('link', { name: 'Bills' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await user.click(within(section).getByRole('link', { name: 'Invoices' }))

    await waitFor(() => expect(types.at(-1)).toBe('customer_invoice'))
    expect(await screen.findByText('No customer invoices yet.')).toBeInTheDocument()
  })

  it('is only for sales or purchase users', async () => {
    signInAs(makeUser({ inventory_access: 'manager' }))
    renderApp('/invoices')

    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument()
  })
})

describe('invoice page', () => {
  function mockInvoice(invoice: Invoice) {
    mockReferenceData()
    server.use(http.get(`${API}/invoices/5`, () => HttpResponse.json(invoice)))
  }

  it('shows an invoice from another module read-only', async () => {
    mockInvoice(makeInvoice())
    signInAs(makeUser({ purchase_access: 'manager' }))
    renderApp('/invoices/5')

    expect(await screen.findByRole('heading', { name: /Draft #5/ })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Desk' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    // Reading is enough to print it.
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Post|Cancel invoice|Remove/ }),
    ).not.toBeInTheDocument()
  })

  it('lets sales users edit a draft in place but not post it', async () => {
    mockInvoice(makeInvoice())
    let body: unknown
    server.use(
      http.patch(`${API}/invoices/5/lines/61`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ detail: 'at most 4.000 can be invoiced' }, { status: 409 })
      }),
    )
    signInAs(salesUser)
    renderApp('/invoices/5')
    const user = userEvent.setup()

    const quantity = await screen.findByRole('textbox', { name: 'Quantity for Desk' })
    expect(screen.queryByRole('button', { name: 'Post' })).not.toBeInTheDocument()
    await user.clear(quantity)
    await user.type(quantity, '6{Enter}')

    expect(await screen.findByText('at most 4.000 can be invoiced')).toBeInTheDocument()
    expect(body).toEqual({ quantity: '6' })
  })

  it('posts with the chosen dates and shows the number', async () => {
    mockInvoice(makeInvoice())
    let body: unknown
    server.use(
      http.post(`${API}/invoices/5/post`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(posted)
      }),
    )
    signInAs(salesManager)
    renderApp('/invoices/5')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Post' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Due date')).toHaveValue(addDays(today(), 30))
    await user.click(within(dialog).getByRole('button', { name: 'On receipt' }))
    await user.click(within(dialog).getByRole('button', { name: 'Post invoice' }))

    await waitFor(() => expect(body).toEqual({ invoice_date: today(), due_date: today() }))
    expect(await screen.findByRole('heading', { name: /INV00001/ })).toBeInTheDocument()
  })

  it('needs a line before posting', async () => {
    mockInvoice(makeInvoice({ lines: [], amount_total: '0', amount_due: '0' }))
    signInAs(salesManager)
    renderApp('/invoices/5')

    expect(await screen.findByRole('button', { name: 'Post' })).toBeDisabled()
    expect(screen.getByLabelText('Add at least one line first.')).toBeInTheDocument()
  })

  it('pre-fills the amount due and refuses a larger payment', async () => {
    mockInvoice(posted)
    let body: unknown
    server.use(
      http.post(`${API}/invoices/5/payments`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(
          {
            ...posted,
            payments: [
              {
                id: 1,
                amount: '50.00',
                paid_on: today(),
                reference: 'TRF-1',
                created_at: '2026-11-01T10:00:00Z',
                created_by: { id: 1, name: 'Admin' },
              },
            ],
            amount_paid: '50.00',
            amount_due: '150.00',
            payment_state: 'partial',
          },
          { status: 201 },
        )
      }),
    )
    signInAs(salesManager)
    renderApp('/invoices/5')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Register payment' }))
    const dialog = await screen.findByRole('dialog')
    const amount = within(dialog).getByLabelText('Amount')
    expect(amount).toHaveValue('200.00')
    expect(within(dialog).getByText('USD')).toBeInTheDocument()

    await user.clear(amount)
    await user.type(amount, '250')
    await user.click(within(dialog).getByRole('button', { name: 'Record payment' }))
    expect(await within(dialog).findByText(/At most .*200.00 is due/)).toBeInTheDocument()
    expect(body).toBeUndefined()

    await user.clear(amount)
    await user.type(amount, '50')
    await user.type(within(dialog).getByLabelText('Reference (optional)'), 'TRF-1')
    await user.click(within(dialog).getByRole('button', { name: 'Record payment' }))

    await waitFor(() =>
      expect(body).toEqual({ amount: '50', paid_on: today(), reference: 'TRF-1' }),
    )
    expect(await screen.findByText('Partly paid')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'TRF-1' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Amount (USD)' })).toBeInTheDocument()
    // Who recorded it, and who drafted the invoice.
    expect(screen.getByRole('cell', { name: 'Admin' })).toBeInTheDocument()
    expect(screen.getByText('Created by').nextElementSibling).toHaveTextContent('Admin')
  })

  it('cannot be cancelled once it has payments', async () => {
    mockInvoice({
      ...posted,
      payments: [
        {
          id: 1,
          amount: '200.00',
          paid_on: '2026-10-10',
          reference: null,
          created_at: '2026-10-10T10:00:00Z',
          created_by: { id: 1, name: 'Admin' },
        },
      ],
      amount_paid: '200.00',
      amount_due: '0.00',
      payment_state: 'paid',
    })
    signInAs(salesManager)
    renderApp('/invoices/5')

    expect(await screen.findByRole('button', { name: 'Cancel invoice' })).toBeDisabled()
    // The badge and the totals panel both say "Paid".
    expect(screen.getAllByText('Paid').length).toBeGreaterThan(0)
    expect(screen.queryByText('Not paid')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Register payment' })).not.toBeInTheDocument()
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument()
  })

  describe('PDF', () => {
    afterEach(() => vi.restoreAllMocks())

    it('downloads under the name the server gives', async () => {
      mockInvoice(posted)
      let auth: string | null = null
      server.use(
        http.get(`${API}/invoices/5/pdf`, ({ request }) => {
          auth = request.headers.get('Authorization')
          return new HttpResponse(new Blob(['%PDF-1.7']), {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': 'attachment; filename="INV00001.pdf"',
            },
          })
        }),
      )
      URL.createObjectURL = vi.fn(() => 'blob:pdf')
      URL.revokeObjectURL = vi.fn()
      const saved: string[] = []
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        saved.push(this.download)
      })
      signInAs(salesUser)
      renderApp('/invoices/5')
      const user = userEvent.setup()

      await user.click(await screen.findByRole('button', { name: 'Download PDF' }))

      await waitFor(() => expect(saved).toEqual(['INV00001.pdf']))
      expect(auth).toMatch(/^Bearer /)
    })

    it('says why a PDF is refused', async () => {
      mockInvoice(posted)
      server.use(
        http.get(`${API}/invoices/5/pdf`, () =>
          HttpResponse.json({ detail: "cancelled invoices can't be printed" }, { status: 409 }),
        ),
      )
      signInAs(salesUser)
      renderApp('/invoices/5')
      const user = userEvent.setup()

      await user.click(await screen.findByRole('button', { name: 'Download PDF' }))
      expect(await screen.findByText("cancelled invoices can't be printed")).toBeInTheDocument()
    })

    it('is not offered on a cancelled invoice', async () => {
      mockInvoice({ ...posted, state: 'cancelled' })
      signInAs(salesUser)
      renderApp('/invoices/5')

      expect(await screen.findByRole('heading', { name: /INV00001/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Download PDF' })).not.toBeInTheDocument()
    })
  })
})

describe('totals elsewhere after a payment', () => {
  it('refreshes the partner totals at once, even within the cache time', async () => {
    mockReferenceData()
    let due = '200.00'
    server.use(
      http.get(`${API}/partners/6/summary`, () =>
        HttpResponse.json({
          sales_orders: null,
          purchase_orders: null,
          customer_invoices: { invoiced: '200.00', due },
          vendor_bills: null,
        }),
      ),
      http.get(`${API}/invoices`, () => HttpResponse.json([posted])),
      http.get(`${API}/invoices/5`, () => HttpResponse.json(posted)),
      http.post(`${API}/invoices/5/payments`, () => {
        due = '0.00'
        return HttpResponse.json(
          { ...posted, amount_paid: '200.00', amount_due: '0.00', payment_state: 'paid' },
          { status: 201 },
        )
      }),
    )
    signInAs(salesManager)
    const { router, queryClient } = renderApp('/partners/6')
    // As in the app: what was fetched in the last 30 seconds isn't asked for again.
    queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 30_000 } })
    const user = userEvent.setup()

    expect(
      await screen.findByRole('link', { name: '200.00 invoiced, 200.00 still due' }),
    ).toBeInTheDocument()

    await router.navigate('/invoices/5')
    await user.click(await screen.findByRole('button', { name: 'Register payment' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Record payment' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await router.navigate('/partners/6')
    expect(
      await screen.findByRole('link', { name: '200.00 invoiced, 0.00 still due' }),
    ).toBeInTheDocument()
  })
})

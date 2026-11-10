import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { makeUser, renderApp, signInAs } from '@/test/renderApp'
import { API, server } from '@/test/server'
import type { Partner } from './queries'

function makePartner(overrides: Partial<Partner> = {}): Partner {
  return {
    id: 1,
    name: 'Acme',
    email: 'sales@acme.test',
    phone: '555-0100',
    address: null,
    is_customer: false,
    is_supplier: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    created_by: { id: 1, name: 'Admin' },
    ...overrides,
  }
}

describe('partners', () => {
  it('filters by role through the API', async () => {
    const requests: URLSearchParams[] = []
    server.use(
      http.get(`${API}/partners`, ({ request }) => {
        requests.push(new URL(request.url).searchParams)
        return HttpResponse.json([makePartner()])
      }),
    )
    signInAs(makeUser())
    renderApp('/partners')
    const user = userEvent.setup()

    expect(await screen.findByRole('link', { name: 'Acme' })).toBeInTheDocument()
    expect(requests.at(-1)?.has('is_customer')).toBe(false)

    await user.click(screen.getByRole('tab', { name: 'Customers' }))
    await waitFor(() => expect(requests.at(-1)?.get('is_customer')).toBe('true'))
    expect(requests.at(-1)?.has('is_supplier')).toBe(false)
  })

  it('sends null when contact fields are cleared', async () => {
    let body: unknown
    server.use(
      http.get(`${API}/partners/1`, () => HttpResponse.json(makePartner())),
      http.get(`${API}/invoices`, () => HttpResponse.json([])),
      http.patch(`${API}/partners/1`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(makePartner({ email: null }))
      }),
    )
    signInAs(makeUser({ purchase_access: 'user' }))
    renderApp('/partners/1')
    const user = userEvent.setup()

    await user.clear(await screen.findByLabelText('Email'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(body).toEqual({
        name: 'Acme',
        email: null,
        phone: '555-0100',
        address: null,
        is_customer: false,
        is_supplier: true,
      }),
    )
  })

  it('is read-only without sales or purchase access', async () => {
    server.use(http.get(`${API}/partners/1`, () => HttpResponse.json(makePartner())))
    signInAs(makeUser({ inventory_access: 'manager' }))
    renderApp('/partners/1')

    expect(await screen.findByLabelText('Name')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
  })

  it('shows what is still owed on open bills', async () => {
    const bill = (id: number, due: string, dueDate: string) => ({
      id,
      number: `BILL0000${id}`,
      invoice_type: 'vendor_bill',
      state: 'posted',
      partner_id: 1,
      sales_order_id: null,
      purchase_order_id: 7,
      invoice_date: '2026-01-01',
      due_date: dueDate,
      posted_at: '2026-01-01T10:00:00Z',
      posted_by: { id: 1, name: 'Admin' },
      created_at: '2026-01-01T10:00:00Z',
      created_by: { id: 1, name: 'Admin' },
      amount_total: '100.00',
      amount_paid: '0',
      amount_due: due,
      payment_state: due === '0.00' ? 'paid' : 'not_paid',
      lines: [],
      payments: [],
    })
    let query: URLSearchParams | undefined
    server.use(
      http.get(`${API}/partners/1`, () => HttpResponse.json(makePartner())),
      http.get(`${API}/invoices`, ({ request }) => {
        query = new URL(request.url).searchParams
        return HttpResponse.json([
          bill(1, '0.00', '2026-01-31'),
          bill(2, '40.50', '2000-01-31'),
          bill(3, '100.00', '2999-01-31'),
        ])
      }),
    )
    signInAs(makeUser({ purchase_access: 'user', sales_access: 'user' }))
    renderApp('/partners/1')

    const open = await screen.findByRole('list', { name: 'Open bills' })
    expect(
      within(open)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['BILL00002', 'BILL00003'])
    expect(within(open).getByText('Overdue')).toBeInTheDocument()
    expect(screen.getByText('You owe').parentElement).toHaveTextContent('140.50')
    expect(screen.getByRole('link', { name: 'All bills' })).toHaveAttribute(
      'href',
      '/invoices?type=vendor_bill&partner=1',
    )
    expect(query?.get('state')).toBe('posted')
    expect(query?.get('partner_id')).toBe('1')
    // Acme is only a supplier, so there are no customer invoices to show.
    expect(screen.queryByRole('heading', { name: 'Invoices' })).not.toBeInTheDocument()
  })

  it('sums up orders and invoices in buttons above the partner', async () => {
    const queries: string[] = []
    const order = (id: number, state: string, total: string) => ({
      id,
      reference: `SO0000${id}`,
      partner_id: 1,
      warehouse_id: 1,
      state,
      created_at: '2026-01-01T10:00:00Z',
      created_by: { id: 1, name: 'Admin' },
      lines: [],
      total,
    })
    server.use(
      http.get(`${API}/partners/1`, () =>
        HttpResponse.json(makePartner({ is_customer: true, is_supplier: true })),
      ),
      http.get(`${API}/sales-orders`, ({ request }) => {
        queries.push(new URL(request.url).search)
        return HttpResponse.json([
          order(1, 'confirmed', '100.00'),
          order(2, 'draft', '20.50'),
          order(3, 'cancelled', '999.00'),
        ])
      }),
      http.get(`${API}/invoices`, ({ request }) => {
        const query = new URL(request.url).searchParams
        if (query.get('invoice_type') !== 'customer_invoice') return HttpResponse.json([])
        return HttpResponse.json([
          { amount_total: '100.00', amount_due: '40.00' },
          { amount_total: '50.00', amount_due: '0.00' },
        ])
      }),
    )
    // Sales only: purchase orders stay hidden, but both invoice kinds can be read.
    signInAs(makeUser({ sales_access: 'user' }))
    renderApp('/partners/1')

    const sales = await screen.findByRole('link', { name: /2 sales orders/ })
    expect(sales).toHaveTextContent('120.50 in total')
    expect(sales).toHaveAttribute('href', '/sales-orders?partner=1')
    expect(queries[0]).toContain('partner_id=1')
    const invoiced = await screen.findByRole('link', { name: /150.00 invoiced/ })
    expect(invoiced).toHaveTextContent('40.00 still due')
    expect(invoiced).toHaveAttribute('href', '/invoices?type=customer_invoice&partner=1')
    expect(await screen.findByRole('link', { name: /0.00 billed/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /purchase order/ })).not.toBeInTheDocument()
  })
})

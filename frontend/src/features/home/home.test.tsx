import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { PAGE_SIZE } from '@/lib/useListParams'
import { makeUser, renderApp, signInAs } from '@/test/renderApp'
import { API, server } from '@/test/server'

function card(title: string) {
  return screen.getByText(title).closest('a')!
}

async function findCard(title: string) {
  return (await screen.findByText(title)).closest('a')!
}

function stockRow(productId: number, name: string, available: string) {
  return {
    product_id: productId,
    sku: name.toUpperCase(),
    product_name: name,
    warehouse_id: 1,
    on_hand: '2.000',
    reserved: '2.000',
    available,
  }
}

describe('start page', () => {
  it('counts what needs attention, for the areas the user can act on', async () => {
    server.use(
      http.get(`${API}/transfers`, ({ request }) => {
        const type = new URL(request.url).searchParams.get('transfer_type')
        if (type === 'receipt') {
          return HttpResponse.json([21, null, null].map((parent) => ({ backorder_of_id: parent })))
        }
        return HttpResponse.json(Array.from({ length: PAGE_SIZE }, () => ({ backorder_of_id: 4 })))
      }),
      http.get(`${API}/stock`, () =>
        HttpResponse.json([
          stockRow(1, 'Desk', '0.000'),
          stockRow(2, 'Lamp', '5.000'),
          stockRow(3, 'Chair', '-1.000'),
        ]),
      ),
    )
    signInAs(makeUser({ inventory_access: 'user' }))
    renderApp('/')

    await screen.findByText('Receipts to validate')
    expect(await within(card('Receipts to validate')).findByText('3')).toBeInTheDocument()
    expect(card('Receipts to validate')).toHaveAttribute(
      'href',
      '/transfers?type=receipt&state=ready',
    )
    expect(
      within(card('Receipts to validate')).getByText('Including 1 backorder'),
    ).toBeInTheDocument()
    expect(
      await within(card('Deliveries to validate')).findByText(`${PAGE_SIZE}+`),
    ).toBeInTheDocument()
    // A full page may hide more.
    expect(
      within(card('Deliveries to validate')).getByText(
        `Including at least ${PAGE_SIZE} backorders`,
      ),
    ).toBeInTheDocument()
    expect(await within(card('Short on stock')).findByText('2')).toBeInTheDocument()
    expect(within(card('Short on stock')).getByText('Desk, Chair')).toBeInTheDocument()
    expect(screen.queryByText(/Purchase orders (to confirm|in draft)/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Sales orders (to confirm|in draft)/)).not.toBeInTheDocument()
    expect(screen.queryByText(/(Invoices|Bills) (to post|in draft)/)).not.toBeInTheDocument()
  })

  it('words drafts as "to confirm" for managers', async () => {
    server.use(
      http.get(`${API}/sales-orders`, () => HttpResponse.json([])),
      http.get(`${API}/stock`, () => HttpResponse.json([])),
    )
    signInAs(makeUser({ sales_access: 'manager' }))
    renderApp('/')

    expect(await screen.findByText('Sales orders to confirm')).toBeInTheDocument()
    expect(
      await within(card('Sales orders to confirm')).findByText('Nothing waiting'),
    ).toBeInTheDocument()
  })

  it('counts draft invoices and bills by who can post them', async () => {
    const requests: string[] = []
    server.use(
      http.get(`${API}/invoices`, ({ request }) => {
        const query = new URL(request.url).searchParams
        requests.push(`${query.get('invoice_type')}:${query.get('state')}`)
        return HttpResponse.json(
          Array.from({ length: query.get('invoice_type') === 'vendor_bill' ? 2 : 1 }),
        )
      }),
      http.get(`${API}/purchase-orders`, () => HttpResponse.json([])),
      http.get(`${API}/sales-orders`, () => HttpResponse.json([])),
      http.get(`${API}/stock`, () => HttpResponse.json([])),
    )
    signInAs(makeUser({ purchase_access: 'manager', sales_access: 'user' }))
    renderApp('/')

    expect(await within(await findCard('Bills to post')).findByText('2')).toBeInTheDocument()
    expect(card('Bills to post')).toHaveAttribute('href', '/invoices?type=vendor_bill&state=draft')
    expect(await within(card('Invoices in draft')).findByText('1')).toBeInTheDocument()
    expect(requests.sort()).toEqual(['customer_invoice:draft', 'vendor_bill:draft'])
  })
})

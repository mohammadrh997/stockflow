import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { PAGE_SIZE } from '@/lib/useListParams'
import { makeUser, renderApp, signInAs } from '@/test/renderApp'
import { API, server } from '@/test/server'
import type { Product } from './queries'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    name: 'Desk',
    sku: 'DESK-1',
    sale_price: '50.00',
    cost_price: '30.00',
    image_key: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    created_by_id: 1,
    ...overrides,
  }
}

const manager = makeUser({ inventory_access: 'manager' })
const viewer = makeUser({ sales_access: 'user' })

describe('products list', () => {
  it('sends filters and pages to the API and enables Next on a full page', async () => {
    const requests: URLSearchParams[] = []
    server.use(
      http.get(`${API}/products`, ({ request }) => {
        const query = new URL(request.url).searchParams
        requests.push(query)
        const count = query.get('skip') === '0' ? PAGE_SIZE : 3
        return HttpResponse.json(
          Array.from({ length: count }, (_, index) =>
            makeProduct({ id: index + 1, name: `Product ${index + 1}` }),
          ),
        )
      }),
    )
    signInAs(viewer)
    const { router } = renderApp('/products')
    const user = userEvent.setup()

    expect(await screen.findByRole('link', { name: 'Product 1' })).toBeInTheDocument()
    const next = screen.getByRole('button', { name: /Next/ })
    expect(next).toBeEnabled()

    await user.click(next)

    await waitFor(() => expect(router.state.location.search).toBe('?page=1'))
    await waitFor(() => expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled())
    expect(requests.at(-1)?.get('skip')).toBe(String(PAGE_SIZE))

    await user.click(screen.getByLabelText('Show archived'))
    await waitFor(() => expect(requests.at(-1)?.get('include_archived')).toBe('true'))
    expect(requests.at(-1)?.get('skip')).toBe('0')
  })

  it('offers New product only to inventory managers', async () => {
    server.use(http.get(`${API}/products`, () => HttpResponse.json([makeProduct()])))
    signInAs(viewer)
    renderApp('/products')

    expect(await screen.findByRole('link', { name: 'Desk' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /New product/ })).not.toBeInTheDocument()
  })

  it('opens a product when any part of its row is clicked', async () => {
    server.use(
      http.get(`${API}/products`, () => HttpResponse.json([makeProduct()])),
      http.get(`${API}/products/1`, () => HttpResponse.json(makeProduct())),
    )
    signInAs(viewer)
    const { router } = renderApp('/products')
    const user = userEvent.setup()

    await user.click(await screen.findByText('DESK-1'))

    await waitFor(() => expect(router.state.location.pathname).toBe('/products/1'))
  })

  it('shows the empty state', async () => {
    server.use(http.get(`${API}/products`, () => HttpResponse.json([])))
    signInAs(viewer)
    renderApp('/products')

    expect(await screen.findByText('No products yet.')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument()
  })
})

describe('product page', () => {
  it('is read-only for people who cannot manage products', async () => {
    server.use(http.get(`${API}/products/1`, () => HttpResponse.json(makeProduct())))
    signInAs(viewer)
    renderApp('/products/1')

    expect(await screen.findByLabelText('Name')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
  })

  it('shows a duplicate SKU conflict from the server', async () => {
    server.use(
      http.get(`${API}/products/1`, () => HttpResponse.json(makeProduct())),
      http.patch(`${API}/products/1`, () =>
        HttpResponse.json({ detail: 'SKU already Exist' }, { status: 409 }),
      ),
    )
    signInAs(manager)
    renderApp('/products/1')
    const user = userEvent.setup()

    const sku = await screen.findByLabelText('SKU')
    await user.clear(sku)
    await user.type(sku, 'taken')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('SKU already Exist')).toBeInTheDocument()
  })

  it('sends prices as strings and maps 422 errors to their fields', async () => {
    let body: unknown
    server.use(
      http.post(`${API}/products`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(
          {
            detail: [
              { loc: ['body', 'sale_price'], msg: 'Too many digits', type: 'decimal_max_digits' },
            ],
          },
          { status: 422 },
        )
      }),
    )
    signInAs(manager)
    renderApp('/products/new')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Name'), 'Chair')
    await user.type(screen.getByLabelText('SKU'), 'chair-1')
    await user.type(screen.getByLabelText('Sale price'), '12.50')
    await user.click(screen.getByRole('button', { name: 'Create product' }))

    expect(await screen.findByText('Too many digits')).toBeInTheDocument()
    expect(screen.getByLabelText('Sale price')).toHaveAttribute('aria-invalid', 'true')
    expect(body).toEqual({
      name: 'Chair',
      sku: 'chair-1',
      sale_price: '12.50',
      cost_price: '0.00',
    })
  })

  it('archives after confirmation', async () => {
    let archived = false
    server.use(
      http.get(`${API}/products/1`, () => HttpResponse.json(makeProduct())),
      http.post(`${API}/products/1/archive`, () => {
        archived = true
        return HttpResponse.json(makeProduct({ is_active: false }))
      }),
    )
    signInAs(manager)
    renderApp('/products/1')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Archive' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(archived).toBe(false)
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }))

    await waitFor(() => expect(archived).toBe(true))
    expect(await screen.findByRole('button', { name: 'Unarchive' })).toBeInTheDocument()
  })

  it('shows not found for an unknown product', async () => {
    server.use(
      http.get(`${API}/products/99`, () =>
        HttpResponse.json({ detail: 'Product Was Not Found' }, { status: 404 }),
      ),
    )
    signInAs(viewer)
    renderApp('/products/99')

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('forbids the new product page to non-managers', async () => {
    signInAs(viewer)
    renderApp('/products/new')

    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument()
  })
})

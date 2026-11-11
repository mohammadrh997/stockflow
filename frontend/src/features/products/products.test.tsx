import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { PAGE_SIZE } from '@/lib/useListParams'
import { makeUser, renderApp, signInAs } from '@/test/renderApp'
import { API, server } from '@/test/server'
import type { Product } from './queries'
import type { ProductMove } from './useProductMoves'
import type { ProductSummary } from './useProductOrders'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    name: 'Desk',
    sku: 'DESK-1',
    sale_price: '50.00',
    cost_price: '30.00',
    category_id: null,
    image_url: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    created_by: { id: 1, name: 'Admin' },
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
      category_id: null,
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

describe('product image', () => {
  const url = 'https://images.test/products/abc.webp'

  it('shows a small picture in the list, or a plain box without one', async () => {
    server.use(
      http.get(`${API}/products`, () =>
        HttpResponse.json([
          makeProduct({ image_url: url }),
          makeProduct({ id: 2, name: 'Lamp', sku: 'LAMP' }),
        ]),
      ),
    )
    signInAs(viewer)
    renderApp('/products')

    const desk = (await screen.findByRole('link', { name: 'Desk' })).closest('tr')!
    const lamp = screen.getByRole('link', { name: 'Lamp' }).closest('tr')!
    expect(desk.querySelector(`img[src="${url}"]`)).not.toBeNull()
    expect(lamp.querySelector('img')).toBeNull()
  })

  function png(name = 'desk.png', bytes = 10) {
    return new File([new Uint8Array(bytes)], name, { type: 'image/png' })
  }

  it('uploads a picture and shows it', async () => {
    let uploaded: string | undefined
    server.use(
      http.get(`${API}/products/1`, () => HttpResponse.json(makeProduct())),
      http.put(`${API}/products/1/image`, async ({ request }) => {
        uploaded = request.headers.get('content-type') ?? ''
        return HttpResponse.json(makeProduct({ image_url: url }))
      }),
    )
    signInAs(manager)
    renderApp('/products/1')
    const user = userEvent.setup()

    expect(await screen.findByText('No image yet')).toBeInTheDocument()
    await user.upload(screen.getByLabelText('Image file'), png())

    await waitFor(() => expect(uploaded).toMatch(/^multipart\/form-data; boundary=/))
    expect(await screen.findByRole('button', { name: 'Replace image' })).toBeInTheDocument()
    expect(document.querySelector(`img[src="${url}"]`)).not.toBeNull()
  })

  it('refuses a wrong file before sending it, and explains server refusals', async () => {
    let requests = 0
    server.use(
      http.get(`${API}/products/1`, () => HttpResponse.json(makeProduct())),
      http.put(`${API}/products/1/image`, () => {
        requests += 1
        return HttpResponse.json({ detail: "Image storage isn't configured" }, { status: 503 })
      }),
    )
    signInAs(manager)
    renderApp('/products/1')
    const user = userEvent.setup({ applyAccept: false })
    const input = await screen.findByLabelText('Image file')

    await user.upload(input, new File(['GIF89a'], 'cat.gif', { type: 'image/gif' }))
    expect(await screen.findByText('Choose a JPEG, PNG or WebP image.')).toBeInTheDocument()
    await user.upload(input, png('big.png', 5 * 1024 * 1024 + 1))
    expect(await screen.findByText('The image must be 5 MB or smaller.')).toBeInTheDocument()
    expect(requests).toBe(0)

    await user.upload(input, png())
    expect(
      await screen.findByText("Image uploads aren't set up on this server yet."),
    ).toBeInTheDocument()
    expect(requests).toBe(1)
  })

  it('removes the picture after confirming', async () => {
    let removed = false
    server.use(
      http.get(`${API}/products/1`, () => HttpResponse.json(makeProduct({ image_url: url }))),
      http.delete(`${API}/products/1/image`, () => {
        removed = true
        return HttpResponse.json(makeProduct())
      }),
    )
    signInAs(manager)
    renderApp('/products/1')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Remove image' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove image' }),
    )

    await waitFor(() => expect(removed).toBe(true))
    expect(await screen.findByText('No image yet')).toBeInTheDocument()
  })

  it('only shows the picture to people who cannot manage products', async () => {
    server.use(
      http.get(`${API}/products/1`, () => HttpResponse.json(makeProduct({ image_url: url }))),
    )
    signInAs(viewer)
    renderApp('/products/1')

    expect(await screen.findByRole('heading', { name: 'Desk' })).toBeInTheDocument()
    expect(document.querySelector(`img[src="${url}"]`)).not.toBeNull()
    expect(screen.queryByLabelText('Image file')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /image/i })).not.toBeInTheDocument()
  })
})

function mockSummary(summary: Partial<ProductSummary> = {}) {
  server.use(
    http.get(`${API}/products/1/summary`, () =>
      HttpResponse.json({ stock: null, sales: null, purchases: null, ...summary }),
    ),
  )
}

describe('product smart buttons', () => {
  function order(id: number, state: string, lines: [number, string][]) {
    return {
      id,
      reference: `SO${String(id).padStart(5, '0')}`,
      partner_id: 6,
      warehouse_id: 1,
      state,
      created_at: '2026-01-01T10:00:00Z',
      created_by: { id: 1, name: 'Admin' },
      total: '0',
      lines: lines.map(([productId, quantity], index) => ({
        id: id * 10 + index,
        product_id: productId,
        quantity,
        unit_price: '1.00',
        subtotal: '0',
      })),
    }
  }

  it('shows stock, and counts the orders holding the product without cancelled ones', async () => {
    // 103 orders hold the desk, oldest first: #102 was cancelled and #103 is a draft.
    const all = Array.from({ length: 103 }, (_, i) =>
      order(i + 1, i === 101 ? 'cancelled' : i === 102 ? 'draft' : 'confirmed', [
        [1, '1.000'],
        [2, '5.000'],
      ]),
    )
    const queries: string[] = []
    mockSummary({ sales: { committed_quantity: '101.000' } })
    server.use(
      http.get(`${API}/products/1`, () => HttpResponse.json(makeProduct())),
      http.get(`${API}/stock`, ({ request }) => {
        expect(new URL(request.url).searchParams.get('product_id')).toBe('1')
        return HttpResponse.json([
          {
            product_id: 1,
            sku: 'DESK-1',
            product_name: 'Desk',
            warehouse_id: 1,
            on_hand: '10.000',
            reserved: '3.000',
            available: '7.000',
          },
          {
            product_id: 1,
            sku: 'DESK-1',
            product_name: 'Desk',
            warehouse_id: 2,
            on_hand: '2.000',
            reserved: '0.000',
            available: '2.000',
          },
        ])
      }),
      http.get(`${API}/sales-orders`, ({ request }) => {
        const params = new URL(request.url).searchParams
        queries.push(params.toString())
        expect(params.get('product_id')).toBe('1')
        // As the server does: cancelled orders are left out when asked.
        const matching = all.filter(
          (o) => params.get('exclude_cancelled') !== 'true' || o.state !== 'cancelled',
        )
        const skip = Number(params.get('skip') ?? 0)
        const limit = Number(params.get('limit'))
        return HttpResponse.json(matching.slice(skip, skip + limit), {
          headers: { 'X-Total-Count': String(matching.length) },
        })
      }),
    )
    signInAs(makeUser({ sales_access: 'user' }))
    renderApp('/products/1')
    const user = userEvent.setup()

    const stock = await screen.findByRole('link', { name: '12 on hand, 9 available' })
    expect(stock).toHaveAttribute('href', '/stock?product=1')

    const sales = await screen.findByRole('button', { name: 'sales orders: 102' })
    await waitFor(() => expect(sales).toHaveTextContent('101 sold'))
    // 102 orders still hold it, so the newest 100 start after the first 2.
    expect(queries).toEqual([
      'product_id=1&exclude_cancelled=true&limit=100',
      'product_id=1&exclude_cancelled=true&skip=2&limit=100',
    ])
    expect(screen.queryByRole('button', { name: /purchase orders/ })).not.toBeInTheDocument()

    // The newest page, newest first, without the cancelled order.
    await user.click(sales)
    const list = await screen.findByRole('list', { name: 'sales orders' })
    const links = within(list).getAllByRole('link')
    expect(links.slice(0, 2).map((link) => link.getAttribute('href'))).toEqual([
      '/sales-orders/103',
      '/sales-orders/101',
    ])
    // A full page now: nothing is dropped after it arrives.
    expect(links).toHaveLength(100)
    expect(screen.getByText('Showing the newest orders only.')).toBeInTheDocument()
  })
})

describe('product moves', () => {
  let next = 1

  function move(
    kind: ProductMove['kind'],
    direction: ProductMove['direction'],
    reference: string,
    from: string,
    to: string,
    quantity: string,
  ): ProductMove {
    const id = next++
    return {
      id,
      created_at: `2026-01-0${id}T10:00:00Z`,
      product_id: 1,
      quantity,
      from_location: { id: 100 + id, name: from },
      to_location: { id: 200 + id, name: to },
      transfer: { id, reference },
      created_by: { id: 2, name: 'Sara' },
      note: null,
      kind,
      direction,
    }
  }

  function mockMoves() {
    next = 1
    const newestFirst = [
      move('in', 1, 'WH/IN/00001', 'Suppliers', 'WH/Stock', '10.000'),
      move('out', -1, 'WH/OUT/00001', 'WH/Stock', 'Customers', '4.000'),
      move('count', 1, 'WH/ADJ/00001', 'Inventory loss', 'WH/Stock', '5.000'),
      move('count', -1, 'WH/ADJ/00001', 'WH/Stock', 'Inventory loss', '1.000'),
      move('internal', 0, 'WH/INT/00001', 'WH/Stock', 'WH/Shelf', '3.000'),
    ].reverse()
    const cursors: (string | null)[] = []
    mockSummary({
      stock: { in: '10.000', out: '4.000', counted_up: '5.000', counted_down: '1.000' },
    })
    server.use(
      http.get(`${API}/products/1`, () => HttpResponse.json(makeProduct())),
      http.get(`${API}/stock`, () => HttpResponse.json([])),
      http.get(`${API}/moves`, ({ request }) => {
        const params = new URL(request.url).searchParams
        expect(params.get('product_id')).toBe('1')
        cursors.push(params.get('before'))
        // Two pages: the three newest, then the rest.
        return HttpResponse.json(
          params.get('before') === null
            ? { items: newestFirst.slice(0, 3), next_cursor: newestFirst[2].id }
            : { items: newestFirst.slice(3), next_cursor: null },
        )
      }),
    )
    return cursors
  }

  it('counts what came in and went out, keeping stock counts apart', async () => {
    mockMoves()
    signInAs(makeUser({ inventory_access: 'user' }))
    renderApp('/products/1')

    const button = await screen.findByRole('link', { name: '10 in · 4 out, Counts +5 / −1' })
    expect(button).toHaveAttribute('href', '/products/1/moves')
  })

  it('is only offered to inventory users', async () => {
    mockSummary({ sales: { committed_quantity: '0.000' } })
    server.use(
      http.get(`${API}/products/1`, () => HttpResponse.json(makeProduct())),
      http.get(`${API}/stock`, () => HttpResponse.json([])),
      http.get(`${API}/sales-orders`, () =>
        HttpResponse.json([], { headers: { 'X-Total-Count': '0' } }),
      ),
    )
    signInAs(makeUser({ sales_access: 'user' }))
    renderApp('/products/1')

    expect(await screen.findByRole('link', { name: /on hand/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: / in · / })).not.toBeInTheDocument()
  })

  it('lists the history newest first, loads older moves and filters by kind', async () => {
    const cursors = mockMoves()
    signInAs(makeUser({ inventory_access: 'user' }))
    renderApp('/products/1/moves')
    const user = userEvent.setup()

    const references = async () =>
      (await screen.findAllByRole('link', { name: /^WH\// })).map((link) => link.textContent)
    expect(await screen.findByRole('heading', { name: 'Moves history' })).toBeInTheDocument()
    await waitFor(async () =>
      expect(await references()).toEqual(['WH/INT/00001', 'WH/ADJ/00001', 'WH/ADJ/00001']),
    )

    await user.click(screen.getByRole('tab', { name: 'Out' }))
    expect(await screen.findByText(/None of this kind among the latest moves/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Load older moves' }))
    const row = (await screen.findByRole('link', { name: 'WH/OUT/00001' })).closest('tr')!
    expect(row).toHaveTextContent('−4')
    expect(row).toHaveTextContent('Customers')
    expect(row).toHaveTextContent('Sara')
    expect(cursors).toEqual([null, '3'])
    expect(screen.queryByRole('button', { name: 'Load older moves' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'In' }))
    expect(
      (await screen.findByRole('link', { name: 'WH/IN/00001' })).closest('tr'),
    ).toHaveTextContent('+10')
  })
})

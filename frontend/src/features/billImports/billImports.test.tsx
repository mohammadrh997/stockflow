import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { makeUser, renderApp, signInAs } from '@/test/renderApp'
import { API, server } from '@/test/server'
import type { BillImport, BillImportLine, BillImportSummary, ImportWarning } from './queries'

const buyer = makeUser({ purchase_access: 'user' })

function line(id: number, overrides: Partial<BillImportLine> = {}): BillImportLine {
  return {
    id,
    description: 'Office Chair Ergonomic, black',
    product_code: 'CHAIR-ERG',
    quantity: '12.000',
    unit_price: '118.50',
    product_id: 3,
    match_score: '1.000',
    subtotal: '1422.00',
    ...overrides,
  }
}

const missingProduct: ImportWarning = {
  code: 'missing_products',
  message: '1 item(s) have no product yet',
  blocks_confirm: true,
}
const totalDiffers: ImportWarning = {
  code: 'total_differs',
  message: "The items add up to 1674.00, but the bill's total is 1700.00",
  blocks_confirm: false,
}

function makeImport(overrides: Partial<BillImport> = {}): BillImport {
  return {
    id: 2,
    state: 'open',
    supplier_name: 'ZAGROS FURNITURE WORKS LLC',
    partner_id: 5,
    partner_reference: 'ZF-0917',
    bill_date: '2026-11-14',
    currency: 'USD',
    bill_total: '1700.00',
    warehouse_id: 1,
    purchase_order_id: null,
    created_at: '2026-11-17T10:00:00Z',
    created_by: { id: 1, name: 'Admin' },
    lines: [
      line(21),
      line(22, {
        description: 'Monitor arm, dual',
        product_code: null,
        quantity: '6.000',
        unit_price: '42.00',
        product_id: null,
        match_score: null,
        subtotal: '252.00',
      }),
    ],
    warnings: [missingProduct, totalDiffers],
    total: '1674.00',
    ...overrides,
  }
}

function summary(overrides: Partial<BillImportSummary> = {}): BillImportSummary {
  return {
    id: 2,
    state: 'open',
    supplier_name: 'ZAGROS FURNITURE WORKS LLC',
    partner_id: 5,
    partner_reference: 'ZF-0917',
    purchase_order_id: null,
    created_at: '2026-11-17T10:00:00Z',
    created_by: { id: 1, name: 'Admin' },
    line_count: 2,
    missing_products: 1,
    ...overrides,
  }
}

const product = (id: number, name: string) => ({
  id,
  name,
  sku: name.toUpperCase().replace(/ /g, '-'),
  sale_price: '50.00',
  cost_price: '30.00',
  category_id: null,
  image_url: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  created_by: { id: 1, name: 'Admin' },
})

function mockReferenceData() {
  server.use(
    http.get(`${API}/warehouses`, () =>
      HttpResponse.json([{ id: 1, name: 'Main', code: 'WH', default_location_id: 4 }]),
    ),
    http.get(`${API}/partners/5`, () =>
      HttpResponse.json({
        id: 5,
        name: 'Zagros Furniture Works',
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
    http.get(`${API}/products/3`, () => HttpResponse.json(product(3, 'Ergonomic Office Chair'))),
    http.get(`${API}/products/9`, () => HttpResponse.json(product(9, 'Monitor Arm'))),
    http.get(`${API}/products`, () => HttpResponse.json([product(9, 'Monitor Arm')])),
  )
}

function mockImport(bill: BillImport = makeImport()) {
  mockReferenceData()
  server.use(http.get(`${API}/bill-imports/2`, () => HttpResponse.json(bill)))
}

describe('bill imports list', () => {
  it('opens on what still needs a review, under Purchase orders', async () => {
    mockReferenceData()
    let query: URLSearchParams | undefined
    server.use(
      http.get(`${API}/bill-imports`, ({ request }) => {
        query = new URL(request.url).searchParams
        return HttpResponse.json([summary()], { headers: { 'X-Total-Count': '1' } })
      }),
    )
    signInAs(buyer)
    renderApp('/bill-imports')

    const row = (await screen.findByRole('link', { name: 'ZF-0917' })).closest('tr')!
    expect(query?.get('state')).toBe('open')
    expect(within(row).getByText('1 without a product')).toBeInTheDocument()
    expect(within(row).getByText('To review')).toBeInTheDocument()
    expect(await within(row).findByText('Zagros Furniture Works')).toBeInTheDocument()
    const [section] = screen.getAllByRole('navigation', { name: 'Section' })
    expect(within(section).getByRole('link', { name: 'Bill imports' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('is only for purchase users', async () => {
    signInAs(makeUser({ sales_access: 'manager' }))
    renderApp('/bill-imports')

    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument()
  })
})

describe('importing a bill', () => {
  function pdf(name = 'bill.pdf', type = 'application/pdf') {
    return new File(['%PDF-1.7'], name, { type })
  }

  async function openDialog() {
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Import a bill' }))
    return { user, input: await screen.findByLabelText('Bill file') }
  }

  it('sends the file and opens its review', async () => {
    mockImport()
    let contentType: string | null = null
    server.use(
      http.get(`${API}/bill-imports`, () =>
        HttpResponse.json([], { headers: { 'X-Total-Count': '0' } }),
      ),
      http.post(`${API}/bill-imports`, ({ request }) => {
        contentType = request.headers.get('content-type')
        return HttpResponse.json(makeImport(), { status: 201 })
      }),
    )
    signInAs(buyer)
    const { router } = renderApp('/bill-imports')
    const { user, input } = await openDialog()

    await user.upload(input, pdf())

    await waitFor(() => expect(router.state.location.pathname).toBe('/bill-imports/2'))
    expect(contentType).toMatch(/^multipart\/form-data/)
    expect(await screen.findByRole('heading', { name: 'Bill ZF-0917' })).toBeInTheDocument()
  })

  it('refuses a wrong file before sending, and says why the server refused one', async () => {
    let sent = 0
    server.use(
      http.get(`${API}/bill-imports`, () =>
        HttpResponse.json([], { headers: { 'X-Total-Count': '0' } }),
      ),
      http.post(`${API}/bill-imports`, () => {
        sent += 1
        return sent === 1
          ? HttpResponse.json({ detail: 'the PDF is password-protected' }, { status: 422 })
          : HttpResponse.json({ detail: 'Rate limit exceeded' }, { status: 429 })
      }),
    )
    signInAs(buyer)
    renderApp('/bill-imports')
    // Bypasses the input's file filter, as dragging a file in would.
    const user = userEvent.setup({ applyAccept: false })
    await user.click(await screen.findByRole('button', { name: 'Import a bill' }))
    const input = await screen.findByLabelText('Bill file')

    await user.upload(input, pdf('notes.txt', 'text/plain'))
    expect(
      await screen.findByText('Choose a PDF, or a JPEG, PNG or WebP photo.'),
    ).toBeInTheDocument()
    expect(sent).toBe(0)

    await user.upload(input, pdf())
    expect(await screen.findByText('The PDF is password-protected.')).toBeInTheDocument()

    await user.upload(input, pdf())
    expect(
      await screen.findByText('You can import 10 bills an hour. Try again later.'),
    ).toBeInTheDocument()
  })
})

describe('reviewing an import', () => {
  it('shows the warnings, and keeps the order from being created while one blocks', async () => {
    mockImport()
    signInAs(buyer)
    renderApp('/bill-imports/2')

    const warnings = await screen.findByRole('list', { name: 'Before creating the order' })
    const items = within(warnings).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('1 item(s) have no product yet(needed)')
    expect(items[1]).toHaveTextContent('(check)')
    expect(screen.getByRole('button', { name: 'Create purchase order' })).toBeDisabled()

    // How each product was found.
    expect(screen.getByText('Matched by its code')).toBeInTheDocument()
    expect(screen.getByText('No match: choose a product')).toBeInTheDocument()
  })

  it('chooses a product for a line, edits it and removes another', async () => {
    mockImport()
    const changes: unknown[] = []
    let removed: string | null = null
    server.use(
      http.patch(`${API}/bill-imports/2/lines/:lineId`, async ({ request, params }) => {
        changes.push({ line: params.lineId, ...((await request.json()) as object) })
        return HttpResponse.json(makeImport())
      }),
      http.delete(`${API}/bill-imports/2/lines/:lineId`, ({ params }) => {
        removed = params.lineId as string
        return HttpResponse.json(makeImport({ lines: [line(22)] }))
      }),
    )
    signInAs(buyer)
    renderApp('/bill-imports/2')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('combobox', { name: 'Product for Monitor arm, dual' }))
    await user.click(await screen.findByRole('option', { name: /Monitor Arm/ }))
    await waitFor(() => expect(changes).toContainEqual({ line: '22', product_id: 9 }))

    const quantity = screen.getByRole('textbox', { name: 'Quantity for Monitor arm, dual' })
    await user.clear(quantity)
    await user.type(quantity, '8{Enter}')
    await waitFor(() => expect(changes).toContainEqual({ line: '22', quantity: '8' }))

    await user.click(screen.getByRole('button', { name: 'Remove Office Chair Ergonomic, black' }))
    await waitFor(() => expect(removed).toBe('21'))
  })

  it('creates the draft order once nothing blocks, and opens it', async () => {
    mockImport(makeImport({ warnings: [totalDiffers] }))
    server.use(
      http.post(`${API}/bill-imports/2/confirm`, () =>
        HttpResponse.json(makeImport({ state: 'done', purchase_order_id: 8, warnings: [] })),
      ),
      http.get(`${API}/purchase-orders/8`, () =>
        HttpResponse.json({
          id: 8,
          reference: 'PO00008',
          partner_id: 5,
          partner_reference: 'ZF-0917',
          warehouse_id: 1,
          state: 'draft',
          created_by: { id: 1, name: 'Admin' },
          created_at: '2026-11-17T10:00:00Z',
          lines: [],
          total: '0.00',
        }),
      ),
      http.get(`${API}/transfers`, () => HttpResponse.json([])),
      http.get(`${API}/invoices`, () => HttpResponse.json([])),
    )
    signInAs(buyer)
    const { router } = renderApp('/bill-imports/2')
    const user = userEvent.setup()

    const create = await screen.findByRole('button', { name: 'Create purchase order' })
    expect(create).toBeEnabled()
    await user.click(create)

    await waitFor(() => expect(router.state.location.pathname).toBe('/purchase-orders/8'))
  })

  it('discards after asking', async () => {
    mockImport()
    let discarded = false
    server.use(
      http.post(`${API}/bill-imports/2/discard`, () => {
        discarded = true
        return HttpResponse.json(makeImport({ state: 'discarded', warnings: [] }))
      }),
    )
    signInAs(buyer)
    renderApp('/bill-imports/2')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Discard' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }),
    )

    await waitFor(() => expect(discarded).toBe(true))
    expect(await screen.findByText('Discarded')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create purchase order' })).not.toBeInTheDocument()
  })

  it('is read-only once it became an order, and links to it', async () => {
    mockImport(makeImport({ state: 'done', purchase_order_id: 8, warnings: [] }))
    server.use(
      http.get(`${API}/purchase-orders/8`, () =>
        HttpResponse.json({
          id: 8,
          reference: 'PO00008',
          partner_id: 5,
          partner_reference: null,
          warehouse_id: 1,
          state: 'draft',
          created_by: { id: 1, name: 'Admin' },
          created_at: '2026-11-17T10:00:00Z',
          lines: [],
          total: '0.00',
        }),
      ),
    )
    signInAs(buyer)
    renderApp('/bill-imports/2')

    expect(await screen.findByRole('link', { name: 'Open PO00008' })).toHaveAttribute(
      'href',
      '/purchase-orders/8',
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('list', { name: 'Before creating the order' }),
    ).not.toBeInTheDocument()
  })
})

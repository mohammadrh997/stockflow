import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { makeUser, renderApp, signInAs } from '@/test/renderApp'
import { API, server } from '@/test/server'
import type { Transfer } from './queries'

function makeTransfer(overrides: Partial<Transfer> = {}): Transfer {
  return {
    id: 30,
    reference: 'WH/IN/00003',
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
    ...overrides,
  }
}

const move = {
  id: 1,
  product_id: 3,
  quantity: '4.000',
  from_location_id: 1,
  to_location_id: 4,
  purchase_line_id: 11,
  sales_line_id: null,
  note: null,
  // Moves still carry only the id.
  created_by_id: 1,
  created_at: '2026-01-02T10:00:00Z',
}

const locations = [
  { id: 1, name: 'Supplier', location_type: 'supplier', warehouse_id: null, is_active: true },
  { id: 3, name: 'Inventory Loss', location_type: 'loss', warehouse_id: null, is_active: true },
  { id: 4, name: 'Stock', location_type: 'internal', warehouse_id: 1, is_active: true },
  { id: 5, name: 'Shelf A', location_type: 'internal', warehouse_id: 1, is_active: true },
]

const desk = {
  id: 3,
  name: 'Desk',
  sku: 'DESK',
  sale_price: '50.00',
  cost_price: '30.00',
  image_url: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  created_by: { id: 1, name: 'Admin' },
}

function mockReferenceData() {
  server.use(
    http.get(`${API}/transfers`, () => HttpResponse.json([])),
    http.get(`${API}/warehouses`, () =>
      HttpResponse.json([{ id: 1, name: 'Main', code: 'WH', default_location_id: 4 }]),
    ),
    http.get(`${API}/locations`, ({ request }) => {
      const query = new URL(request.url).searchParams
      const rows = locations.filter(
        (l) =>
          (!query.has('warehouse_id') || String(l.warehouse_id) === query.get('warehouse_id')) &&
          (!query.has('location_type') || l.location_type === query.get('location_type')),
      )
      return HttpResponse.json(rows)
    }),
    http.get(`${API}/products`, () => HttpResponse.json([desk])),
    http.get(`${API}/products/3`, () => HttpResponse.json(desk)),
  )
}

const inventoryUser = makeUser({ inventory_access: 'user' })
const inventoryManager = makeUser({ inventory_access: 'manager' })

const deskLine = {
  id: 51,
  product_id: 3,
  quantity: '10.000',
  purchase_line_id: 11,
  sales_line_id: null,
}

describe('partial validation', () => {
  function mockReadyReceipt() {
    mockReferenceData()
    let body: unknown
    server.use(
      http.get(`${API}/transfers/30`, () => HttpResponse.json(makeTransfer({ lines: [deskLine] }))),
      http.get(`${API}/transfers`, () => HttpResponse.json([])),
      http.post(`${API}/transfers/30/validate`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(
          makeTransfer({ state: 'done', lines: [{ ...deskLine, quantity: '4.000' }] }),
        )
      }),
    )
    return () => body
  }

  async function openDialog() {
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Validate' }))
    const dialog = await screen.findByRole('dialog')
    return { user, dialog }
  }

  it('sends only the quantity that arrived and says the rest goes to a backorder', async () => {
    const body = mockReadyReceipt()
    signInAs(inventoryUser)
    renderApp('/transfers/30')
    const { user, dialog } = await openDialog()

    const quantity = await within(dialog).findByRole('textbox', { name: 'Quantity for Desk' })
    expect(quantity).toHaveValue('10')
    await user.clear(quantity)
    await user.type(quantity, '4')

    expect(within(dialog).getByText(/goes to a new backorder/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Validate part' }))

    await waitFor(() =>
      expect(body()).toEqual({ location_id: null, lines: [{ line_id: 51, quantity: '4' }] }),
    )
  })

  it('stops more than planned before sending', async () => {
    const body = mockReadyReceipt()
    signInAs(inventoryUser)
    renderApp('/transfers/30')
    const { user, dialog } = await openDialog()

    const quantity = await within(dialog).findByRole('textbox', { name: 'Quantity for Desk' })
    await user.clear(quantity)
    await user.type(quantity, '12')
    await user.click(within(dialog).getByRole('button', { name: 'Validate' }))

    expect(await within(dialog).findByText('At most 10.')).toBeInTheDocument()
    expect(body()).toBeUndefined()
  })

  it('needs at least one quantity', async () => {
    const body = mockReadyReceipt()
    signInAs(inventoryUser)
    renderApp('/transfers/30')
    const { user, dialog } = await openDialog()

    const quantity = await within(dialog).findByRole('textbox', { name: 'Quantity for Desk' })
    await user.clear(quantity)
    await user.type(quantity, '0')
    await user.click(within(dialog).getByRole('button', { name: 'Validate part' }))

    expect(
      await within(dialog).findByText('Enter a quantity on at least one line.'),
    ).toBeInTheDocument()
    expect(body()).toBeUndefined()
  })

  it('sends no per-line detail when everything moves', async () => {
    const body = mockReadyReceipt()
    signInAs(inventoryUser)
    renderApp('/transfers/30')
    const { user, dialog } = await openDialog()

    await within(dialog).findByRole('textbox', { name: 'Quantity for Desk' })
    await user.click(within(dialog).getByRole('button', { name: 'Validate' }))

    await waitFor(() => expect(body()).toEqual({ location_id: null }))
  })
})

describe('backorders', () => {
  const original = makeTransfer({
    state: 'done',
    lines: [{ ...deskLine, quantity: '4.000' }],
    moves: [move],
  })
  const backorder = makeTransfer({
    id: 40,
    reference: 'WH/IN/00008',
    backorder_of_id: 30,
    lines: [{ ...deskLine, id: 52, quantity: '6.000' }],
  })

  function mockChain() {
    mockReferenceData()
    server.use(
      http.get(`${API}/transfers/30`, () => HttpResponse.json(original)),
      http.get(`${API}/transfers/40`, () => HttpResponse.json(backorder)),
      http.get(`${API}/transfers`, () => HttpResponse.json([original, backorder])),
    )
  }

  it('links a transfer to its backorder and back', async () => {
    mockChain()
    signInAs(inventoryUser)
    renderApp('/transfers/30')

    expect(await screen.findByRole('link', { name: 'WH/IN/00008' })).toHaveAttribute(
      'href',
      '/transfers/40',
    )
    expect(screen.getByRole('columnheader', { name: 'Moved' })).toBeInTheDocument()
  })

  it('shows what a backorder still has to move and where it came from', async () => {
    mockChain()
    signInAs(inventoryUser)
    renderApp('/transfers/40')

    expect(await screen.findByRole('link', { name: 'WH/IN/00003' })).toHaveAttribute(
      'href',
      '/transfers/30',
    )
    expect(screen.getByRole('columnheader', { name: 'To move' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel backorder' })).not.toBeInTheDocument()
  })

  it('lets inventory managers cancel a backorder after confirming', async () => {
    mockChain()
    let cancelled = false
    server.use(
      http.post(`${API}/transfers/40/cancel`, () => {
        cancelled = true
        return HttpResponse.json({ ...backorder, state: 'cancelled' })
      }),
    )
    signInAs(makeUser({ inventory_access: 'manager' }))
    renderApp('/transfers/40')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Cancel backorder' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/closed as received with what arrived/)).toBeInTheDocument()
    expect(cancelled).toBe(false)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel backorder' }))

    await waitFor(() => expect(cancelled).toBe(true))
    expect(await screen.findByRole('columnheader', { name: 'Not moved' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Validate' })).not.toBeInTheDocument()
  })

  it('does not offer to cancel a transfer that is not a backorder', async () => {
    mockReferenceData()
    server.use(http.get(`${API}/transfers/30`, () => HttpResponse.json(makeTransfer())))
    signInAs(makeUser({ inventory_access: 'manager' }))
    renderApp('/transfers/30')

    expect(await screen.findByRole('button', { name: 'Validate' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel backorder' })).not.toBeInTheDocument()
  })
})

describe('transfer page', () => {
  it('validates a receipt into the default location and refreshes stock and orders', async () => {
    mockReferenceData()
    let body: unknown
    let validated = false
    server.use(
      http.get(`${API}/transfers/30`, () =>
        HttpResponse.json(
          validated ? makeTransfer({ state: 'done', moves: [move] }) : makeTransfer(),
        ),
      ),
      http.post(`${API}/transfers/30/validate`, async ({ request }) => {
        body = await request.json()
        validated = true
        return HttpResponse.json(
          makeTransfer({
            state: 'done',
            moves: [move],
            validated_at: '2026-01-02T10:00:00Z',
            validated_by: { id: 2, name: 'Sara' },
          }),
        )
      }),
    )
    signInAs(inventoryUser)
    const { queryClient } = renderApp('/transfers/30')
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const user = userEvent.setup()

    expect(await screen.findByRole('heading', { name: 'Products' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Moves' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Validate' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Validate' }))

    await waitFor(() =>
      expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('done'),
    )
    expect(body).toEqual({ location_id: null })
    const row = (await screen.findByRole('link', { name: 'Desk' })).closest('tr')!
    expect(within(row).getByText('Supplier')).toBeInTheDocument()
    expect(within(row).getByText('Stock')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Validate' })).not.toBeInTheDocument()
    expect(screen.getByText('Validated by').nextElementSibling).toHaveTextContent('Sara')
    for (const key of ['stock', 'transfers', 'purchase-order', 'sales-order']) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] })
    }
  })

  it('keeps the server refusal in the validate dialog', async () => {
    mockReferenceData()
    server.use(
      http.get(`${API}/transfers/31`, () =>
        HttpResponse.json(
          makeTransfer({
            id: 31,
            reference: 'WH/OUT/00001',
            transfer_type: 'delivery',
            purchase_order_id: null,
          }),
        ),
      ),
      http.post(`${API}/transfers/31/validate`, () =>
        HttpResponse.json(
          { detail: 'not enough stock in the chosen location(s)' },
          { status: 409 },
        ),
      ),
    )
    signInAs(inventoryUser)
    renderApp('/transfers/31')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Validate' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Automatic/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Validate' }))

    expect(
      await within(dialog).findByText('not enough stock in the chosen location(s)'),
    ).toBeInTheDocument()
  })

  it('does not offer to validate a done transfer', async () => {
    mockReferenceData()
    server.use(
      http.get(`${API}/transfers/32`, () =>
        HttpResponse.json(
          makeTransfer({
            id: 32,
            reference: 'WH/INT/00001',
            transfer_type: 'internal',
            state: 'done',
            purchase_order_id: null,
            moves: [{ ...move, from_location_id: 4, to_location_id: 5, note: 'Restock' }],
          }),
        ),
      ),
    )
    signInAs(inventoryUser)
    renderApp('/transfers/32')

    const row = (await screen.findByRole('link', { name: 'Desk' })).closest('tr')!
    expect(within(row).getByText('Shelf A')).toBeInTheDocument()
    expect(within(row).getByText('Restock')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Validate' })).not.toBeInTheDocument()
  })
})

describe('adjustments', () => {
  async function fillAdjustment(counted: string) {
    const user = userEvent.setup()
    const location = await screen.findByRole('combobox', { name: 'Location' })
    await waitFor(() => expect(location).toBeEnabled())
    location.focus()
    await user.keyboard('{Enter}')
    await user.click(await screen.findByRole('option', { name: 'Shelf A' }))
    await user.click(screen.getByRole('combobox', { name: 'Product' }))
    await user.click(await screen.findByRole('option', { name: /Desk/ }))
    await user.type(screen.getByLabelText('Counted'), counted)
    await user.type(screen.getByLabelText('Reason'), 'Monthly count')
    await user.click(screen.getByRole('button', { name: 'Record adjustment' }))
    return user
  }

  it('confirms before recording and keeps the "nothing to adjust" conflict in the dialog', async () => {
    mockReferenceData()
    let body: unknown
    server.use(
      http.post(`${API}/transfers/adjustments`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(
          { detail: 'counted quantities match current stock' },
          { status: 409 },
        )
      }),
    )
    signInAs(inventoryManager)
    renderApp('/transfers/adjustment')

    const user = await fillAdjustment('0')
    const dialog = await screen.findByRole('alertdialog')
    expect(body).toBeUndefined()
    await user.click(within(dialog).getByRole('button', { name: 'Record adjustment' }))

    expect(
      await within(dialog).findByText('counted quantities match current stock'),
    ).toBeInTheDocument()
    expect(body).toEqual({
      location_id: 5,
      lines: [{ product_id: 3, counted_quantity: '0' }],
      note: 'Monthly count',
    })
  })

  it('opens the new transfer after recording', async () => {
    mockReferenceData()
    server.use(
      http.post(`${API}/transfers/adjustments`, () =>
        HttpResponse.json(
          makeTransfer({
            id: 40,
            reference: 'WH/ADJ/00001',
            transfer_type: 'adjustment',
            state: 'done',
            purchase_order_id: null,
          }),
        ),
      ),
      http.get(`${API}/transfers/40`, () =>
        HttpResponse.json(
          makeTransfer({
            id: 40,
            reference: 'WH/ADJ/00001',
            transfer_type: 'adjustment',
            state: 'done',
            purchase_order_id: null,
          }),
        ),
      ),
    )
    signInAs(inventoryManager)
    const { router } = renderApp('/transfers/adjustment')

    const user = await fillAdjustment('2')
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Record adjustment' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/transfers/40'))
  })

  it('is only for inventory managers', async () => {
    server.use(http.get(`${API}/transfers`, () => HttpResponse.json([])))
    mockReferenceData()
    signInAs(inventoryUser)
    renderApp('/transfers')

    expect(await screen.findByRole('link', { name: /Internal transfer/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Adjustment/ })).not.toBeInTheDocument()
  })

  it('forbids the adjustment page to inventory users', async () => {
    signInAs(inventoryUser)
    renderApp('/transfers/adjustment')

    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument()
  })
})

describe('transfers access', () => {
  it('is forbidden without inventory access', async () => {
    signInAs(makeUser({ sales_access: 'manager' }))
    renderApp('/transfers')

    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument()
  })
})

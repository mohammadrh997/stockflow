import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { makeUser, renderApp, signInAs } from '@/test/renderApp'
import { API, server } from '@/test/server'
import type { Location } from './queries'

const stockLocation: Location = {
  id: 4,
  name: 'Stock',
  location_type: 'internal',
  warehouse_id: 1,
  is_active: true,
}
const shelf: Location = { ...stockLocation, id: 5, name: 'Shelf A' }
const virtual: Location[] = [
  { id: 1, name: 'Supplier', location_type: 'supplier', warehouse_id: null, is_active: true },
  { id: 2, name: 'Customer', location_type: 'customer', warehouse_id: null, is_active: true },
  { id: 3, name: 'Inventory Loss', location_type: 'loss', warehouse_id: null, is_active: true },
]
const warehouse = { id: 1, name: 'Main Warehouse', code: 'WH', default_location_id: 4 }

function mockWarehouseApi() {
  const locationRequests: URLSearchParams[] = []
  server.use(
    http.get(`${API}/warehouses`, () => HttpResponse.json([warehouse])),
    http.get(`${API}/warehouses/1`, () =>
      HttpResponse.json({ ...warehouse, locations: [stockLocation, shelf] }),
    ),
    http.get(`${API}/locations`, ({ request }) => {
      const query = new URL(request.url).searchParams
      locationRequests.push(query)
      if (query.get('warehouse_id') === '1') return HttpResponse.json([stockLocation, shelf])
      return HttpResponse.json([...virtual, stockLocation, shelf])
    }),
  )
  return locationRequests
}

const manager = makeUser({ inventory_access: 'manager' })

describe('warehouses list', () => {
  it('lists warehouses with their default location and the system locations', async () => {
    mockWarehouseApi()
    signInAs(makeUser())
    renderApp('/warehouses')

    const row = (await screen.findByRole('link', { name: 'Main Warehouse' })).closest('tr')!
    expect(within(row).getByText('Stock')).toBeInTheDocument()
    expect(screen.getByText('Inventory Loss')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /New warehouse/ })).not.toBeInTheDocument()
  })
})

describe('warehouse page', () => {
  it('only lists internal locations and never offers to archive the default', async () => {
    const locationRequests = mockWarehouseApi()
    signInAs(manager)
    renderApp('/warehouses/1')

    const shelfRow = (await screen.findByText('Shelf A')).closest('tr')!
    const stockRow = screen.getAllByText('Stock').at(-1)!.closest('tr')!

    expect(within(stockRow).getByText('Default')).toBeInTheDocument()
    expect(within(stockRow).queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
    expect(within(shelfRow).getByRole('button', { name: 'Archive' })).toBeInTheDocument()
    expect(
      locationRequests.every(
        (query) => query.get('warehouse_id') === '1' && query.get('location_type') === 'internal',
      ),
    ).toBe(true)
  })

  it('shows why the server refused to archive a location', async () => {
    mockWarehouseApi()
    server.use(
      http.post(`${API}/locations/5/archive`, () =>
        HttpResponse.json({ detail: 'Move the stock out of this location first' }, { status: 409 }),
      ),
    )
    signInAs(manager)
    renderApp('/warehouses/1')
    const user = userEvent.setup()

    const shelfRow = (await screen.findByText('Shelf A')).closest('tr')!
    await user.click(within(shelfRow).getByRole('button', { name: 'Archive' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }))

    expect(
      await within(dialog).findByText('Move the stock out of this location first'),
    ).toBeInTheDocument()
  })

  it('is read-only for people who cannot manage warehouses', async () => {
    mockWarehouseApi()
    signInAs(makeUser({ inventory_access: 'user' }))
    renderApp('/warehouses/1')

    expect(await screen.findByText('Shelf A')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add location' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })

  it('shows a 409 when a location name is taken', async () => {
    mockWarehouseApi()
    server.use(
      http.post(`${API}/locations`, () =>
        HttpResponse.json({ detail: 'Location Name already Exists' }, { status: 409 }),
      ),
    )
    signInAs(manager)
    renderApp('/warehouses/1')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('New location name'), 'Shelf A')
    await user.click(screen.getByRole('button', { name: 'Add location' }))

    expect(await screen.findByText('Location Name already Exists')).toBeInTheDocument()
  })
})

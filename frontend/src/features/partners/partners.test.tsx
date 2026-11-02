import { screen, waitFor } from '@testing-library/react'
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
    created_by_id: 1,
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
})

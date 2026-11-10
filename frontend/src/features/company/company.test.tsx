import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { API, defaultCompany, server } from '@/test/server'
import { makeUser, renderApp, signInAs } from '@/test/renderApp'
import type { Company } from './queries'

const admin = makeUser({ is_admin: true })
const logoUrl = 'https://images.test/products/company/abc.webp'

function makeCompany(overrides: Partial<Company> = {}): Company {
  return { ...defaultCompany, ...overrides }
}

function mockCompany(company: Company) {
  server.use(http.get(`${API}/settings/company`, () => HttpResponse.json(company)))
}

describe('company settings', () => {
  it('is only for admins', async () => {
    signInAs(makeUser({ sales_access: 'manager' }))
    renderApp('/settings/company')

    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Company' })).not.toBeInTheDocument()
  })

  it('saves the details, clearing emptied fields and leaving an unchanged currency out', async () => {
    mockCompany(makeCompany({ address: 'Karrada\nBaghdad', phone: '+964 770' }))
    let body: unknown
    server.use(
      http.patch(`${API}/settings/company`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(makeCompany({ name: 'ClearCypher', address: 'Karrada\nBaghdad' }))
      }),
    )
    signInAs(admin)
    renderApp('/settings/company')
    const user = userEvent.setup()

    const name = await screen.findByLabelText('Name')
    expect(screen.getByLabelText('Address')).toHaveValue('Karrada\nBaghdad')
    await user.clear(name)
    await user.type(name, '  ClearCypher ')
    await user.clear(screen.getByLabelText('Phone'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Company saved')).toBeInTheDocument()
    expect(body).toEqual({
      name: 'ClearCypher',
      address: 'Karrada\nBaghdad',
      phone: null,
      email: null,
    })
  })

  it('sends a changed currency in capitals and checks its shape first', async () => {
    mockCompany(makeCompany())
    let body: unknown
    server.use(
      http.patch(`${API}/settings/company`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(makeCompany({ currency: 'IQD' }))
      }),
    )
    signInAs(admin)
    renderApp('/settings/company')
    const user = userEvent.setup()

    const currency = await screen.findByLabelText('Currency')
    await user.clear(currency)
    await user.type(currency, 'iq')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Use a three-letter code such as USD.')).toBeInTheDocument()
    expect(body).toBeUndefined()

    await user.type(currency, 'd')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(body).toMatchObject({ currency: 'IQD' }))
  })

  it('keeps a locked currency read-only and says why', async () => {
    mockCompany(makeCompany({ currency_locked: true }))
    signInAs(admin)
    renderApp('/settings/company')

    expect(await screen.findByLabelText('Currency')).toHaveAttribute('readonly')
    expect(
      screen.getByText("Invoices have already been posted in USD, so it can't change."),
    ).toBeInTheDocument()
  })

  it('shows what the server refused', async () => {
    mockCompany(makeCompany())
    server.use(
      http.patch(`${API}/settings/company`, () =>
        HttpResponse.json(
          { detail: "Invoices have already been issued in USD, so the currency can't change" },
          { status: 409 },
        ),
      ),
    )
    signInAs(admin)
    renderApp('/settings/company')
    const user = userEvent.setup()

    const currency = await screen.findByLabelText('Currency')
    await user.clear(currency)
    await user.type(currency, 'EUR')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText(/so the currency can't change/)).toBeInTheDocument()
  })

  it('uploads, then removes, the logo', async () => {
    mockCompany(makeCompany())
    let contentType: string | null = null
    server.use(
      http.put(`${API}/settings/company/logo`, ({ request }) => {
        contentType = request.headers.get('content-type')
        return HttpResponse.json(makeCompany({ logo_url: logoUrl }))
      }),
      http.delete(`${API}/settings/company/logo`, () => HttpResponse.json(makeCompany())),
    )
    signInAs(admin)
    renderApp('/settings/company')
    const user = userEvent.setup()

    expect(await screen.findByText('No logo yet')).toBeInTheDocument()
    await user.upload(
      screen.getByLabelText('Logo file'),
      new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' }),
    )
    expect(await screen.findByRole('img', { name: 'Acme logo' })).toHaveAttribute('src', logoUrl)
    expect(contentType).toMatch(/^multipart\/form-data/)

    await user.click(screen.getByRole('button', { name: 'Remove logo' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove logo' }),
    )
    expect(await screen.findByText('No logo yet')).toBeInTheDocument()
  })
})

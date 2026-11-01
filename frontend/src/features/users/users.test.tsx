import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { makeUser, renderApp, signInAs } from '@/test/renderApp'
import { API, server } from '@/test/server'

const admin = makeUser({ id: 1, name: 'Ada', is_admin: true })
const seller = makeUser({
  id: 2,
  name: 'Sam',
  email: 'sam@example.com',
  sales_access: 'user',
})

describe('users', () => {
  it('is only for admins', async () => {
    signInAs(makeUser({ sales_access: 'manager', purchase_access: 'manager' }))
    renderApp('/users')

    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument()
  })

  it('lists users with their access', async () => {
    server.use(http.get(`${API}/users`, () => HttpResponse.json([admin, seller])))
    signInAs(admin)
    renderApp('/users')

    const row = (await screen.findByRole('link', { name: 'Sam' })).closest('tr')!
    expect(within(row).getByText('Sales: user')).toBeInTheDocument()
  })

  it('disables removing your own admin flag and deactivating yourself', async () => {
    server.use(http.get(`${API}/users/1`, () => HttpResponse.json(admin)))
    signInAs(admin)
    renderApp('/users/1')

    expect(await screen.findByRole('checkbox', { name: 'Administrator' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeDisabled()
    expect(screen.getByLabelText("You can't deactivate yourself.")).toBeInTheDocument()
  })

  it('lets admins deactivate someone else after confirming', async () => {
    let deactivated = false
    server.use(
      http.get(`${API}/users/2`, () => HttpResponse.json({ ...seller, is_active: !deactivated })),
      http.post(`${API}/users/2/deactivate`, () => {
        deactivated = true
        return HttpResponse.json({ ...seller, is_active: false })
      }),
    )
    signInAs(admin)
    renderApp('/users/2')
    const user = userEvent.setup()

    expect(await screen.findByRole('checkbox', { name: 'Administrator' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Deactivate' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }))

    expect(await screen.findByText('Inactive')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Activate' })).toBeInTheDocument()
  })

  it('shows a duplicate email from the server', async () => {
    server.use(
      http.post(`${API}/users`, () =>
        HttpResponse.json({ detail: 'Email already registered' }, { status: 409 }),
      ),
    )
    signInAs(admin)
    renderApp('/users/new')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Name'), 'Sam')
    await user.type(screen.getByLabelText('Email'), 'sam@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create user' }))

    expect(await screen.findByText('Email already registered')).toBeInTheDocument()
  })

  it('resets a password and handles the empty 204 response', async () => {
    let body: unknown
    server.use(
      http.get(`${API}/users/2`, () => HttpResponse.json(seller)),
      http.post(`${API}/users/2/reset-password`, async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    signInAs(admin)
    renderApp('/users/2')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Reset password' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('New password'), 'new-password-1')
    await user.click(within(dialog).getByRole('button', { name: 'Reset password' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(body).toEqual({ new_password: 'new-password-1' })
  })
})

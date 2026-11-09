import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { setAppearance } from '@/lib/appearance'
import { makeUser, renderApp } from '@/test/renderApp'
import { API, server } from '@/test/server'
import { getToken, setToken } from './token'

async function logIn(email = 'ada@example.com', password = 'password123') {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Log in' }))
}

describe('login', () => {
  it('sends the credentials as form data, stores the token and loads the user', async () => {
    let body = ''
    let contentType: string | null = null
    let authorization: string | null = null
    server.use(
      http.post(`${API}/auth/token`, async ({ request }) => {
        contentType = request.headers.get('Content-Type')
        body = await request.text()
        return HttpResponse.json({ access_token: 'new-token', token_type: 'bearer' })
      }),
      http.get(`${API}/auth/me`, ({ request }) => {
        authorization = request.headers.get('Authorization')
        return HttpResponse.json(makeUser())
      }),
    )
    const { router } = renderApp('/')

    await logIn()

    expect(await screen.findByRole('heading', { name: 'Welcome, Ada' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(contentType).toBe('application/x-www-form-urlencoded')
    expect(new URLSearchParams(body).get('username')).toBe('ada@example.com')
    expect(new URLSearchParams(body).get('password')).toBe('password123')
    expect(getToken()).toBe('new-token')
    expect(authorization).toBe('Bearer new-token')
  })

  it('shows wrong credentials without treating them as an expired session', async () => {
    server.use(
      http.post(`${API}/auth/token`, () =>
        HttpResponse.json({ detail: 'Incorrect email or password' }, { status: 401 }),
      ),
    )
    const { router } = renderApp('/login')

    await logIn()

    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument()
    expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(getToken()).toBeNull()
  })

  it('explains the rate limit', async () => {
    server.use(
      http.post(`${API}/auth/token`, () =>
        HttpResponse.json({ error: 'Rate limit exceeded: 5 per 1 minute' }, { status: 429 }),
      ),
    )
    renderApp('/login')

    await logIn()

    expect(
      await screen.findByText('Too many attempts. Wait a minute and try again.'),
    ).toBeInTheDocument()
  })

  it('puts 422 errors on their fields', async () => {
    server.use(
      http.post(`${API}/auth/token`, () =>
        HttpResponse.json(
          { detail: [{ loc: ['body', 'password'], msg: 'Field required', type: 'missing' }] },
          { status: 422 },
        ),
      ),
    )
    renderApp('/login')

    await logIn()

    expect(await screen.findByText('Field required')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('session expiry', () => {
  it('redirects to login on 401 and returns to the same page after logging in', async () => {
    setToken('expired-token')
    let meCalls = 0
    server.use(
      http.get(`${API}/auth/me`, () => {
        meCalls += 1
        return meCalls === 1
          ? HttpResponse.json({ detail: 'Could not validate credentials' }, { status: 401 })
          : HttpResponse.json(makeUser())
      }),
      http.post(`${API}/auth/token`, () =>
        HttpResponse.json({ access_token: 'fresh-token', token_type: 'bearer' }),
      ),
    )
    const { router } = renderApp('/stock?warehouse_id=2')

    expect(
      await screen.findByText('Your session expired. Please log in again.'),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(getToken()).toBeNull()

    await logIn()

    await waitFor(() => expect(router.state.location.pathname).toBe('/stock'))
    expect(router.state.location.search).toBe('?warehouse_id=2')
  })

  it('sends people without a token to login without the expiry message', async () => {
    const { router } = renderApp('/stock')

    expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument()
  })
})

describe('layout', () => {
  it('only lists the sections the user can read', async () => {
    setToken('token')
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json(makeUser({ sales_access: 'user' }))),
    )
    renderApp('/')

    const nav = await screen.findByRole('navigation', { name: 'Main' })
    const links = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent)
    expect(links).toEqual([
      'Stock',
      'Products',
      'Partners',
      'Warehouses',
      'Sales orders',
      'Invoices',
    ])
  })

  it('shows every section to admins', async () => {
    setToken('token')
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json(makeUser({ is_admin: true }))))
    renderApp('/')

    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getAllByRole('link')).toHaveLength(9)
  })

  it('switches between light and dark from the header', async () => {
    setToken('token')
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json(makeUser())))
    setAppearance({ mode: 'light' })
    renderApp('/')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Switch to dark mode' }))
    expect(document.documentElement).toHaveClass('dark')

    await user.click(screen.getByRole('button', { name: 'Switch to light mode' }))
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('logs out by clearing the token and returning to login', async () => {
    setToken('token')
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json(makeUser())))
    const { router, queryClient } = renderApp('/')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Ada/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Log out' }))

    expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(getToken()).toBeNull()
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .filter((query) => query.state.data),
    ).toEqual([])
    expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument()
  })
})

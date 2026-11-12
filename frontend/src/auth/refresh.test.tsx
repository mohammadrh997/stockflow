import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { makeUser, renderApp } from '@/test/renderApp'
import { API, server } from '@/test/server'
import { getRefreshToken, getToken, setTokens } from './token'

const OLD = { access_token: 'old-access', refresh_token: 'old-refresh' }
const NEW = { access_token: 'new-access', refresh_token: 'new-refresh' }

// The API as it behaves once the old access token has run out: only the new one works.
function mockExpiredAccess(onRefresh: (body: unknown) => Response | Promise<Response>) {
  const refreshBodies: unknown[] = []
  const authorizations: (string | null)[] = []
  const onlyNewAccess = (request: Request, body: Parameters<typeof HttpResponse.json>[0]) => {
    authorizations.push(request.headers.get('Authorization'))
    return request.headers.get('Authorization') === `Bearer ${NEW.access_token}`
      ? HttpResponse.json(body)
      : HttpResponse.json({ detail: 'Could not validate credentials' }, { status: 401 })
  }
  server.use(
    http.get(`${API}/auth/me`, ({ request }) => onlyNewAccess(request, makeUser())),
    http.get(`${API}/stock`, ({ request }) => onlyNewAccess(request, [])),
    http.get(`${API}/warehouses`, ({ request }) => onlyNewAccess(request, [])),
    http.post(`${API}/auth/refresh`, async ({ request }) => {
      const body = await request.json()
      refreshBodies.push(body)
      return onRefresh(body)
    }),
  )
  return { refreshBodies, authorizations }
}

describe('renewing the login', () => {
  it('renews quietly when the access token runs out, and repeats the request', async () => {
    setTokens(OLD)
    const { refreshBodies, authorizations } = mockExpiredAccess(() => HttpResponse.json(NEW))
    renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Welcome, Ada' })).toBeInTheDocument()
    expect(refreshBodies).toEqual([{ refresh_token: 'old-refresh' }])
    expect(authorizations.slice(0, 2)).toEqual(['Bearer old-access', 'Bearer new-access'])
    expect(getToken()).toBe('new-access')
    expect(getRefreshToken()).toBe('new-refresh')
    expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument()
  })

  it('renews once for requests that fail together', async () => {
    setTokens(OLD)
    const { refreshBodies } = mockExpiredAccess(async () => {
      // Slow enough that the other requests fail while this one is still running.
      await new Promise((resolve) => setTimeout(resolve, 50))
      return HttpResponse.json(NEW)
    })
    // Signed in already, so the stock page's own requests are the ones that fail together.
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json(makeUser())))
    renderApp('/stock')

    expect(await screen.findByText('No stock recorded yet.')).toBeInTheDocument()
    expect(refreshBodies).toHaveLength(1)
  })

  it('uses tokens another tab has just renewed instead of sending the old one again', async () => {
    setTokens(OLD)
    let calls = 0
    const { refreshBodies } = mockExpiredAccess(() => HttpResponse.json(NEW))
    server.use(
      http.get(`${API}/auth/me`, ({ request }) => {
        calls += 1
        if (calls === 1) {
          // While this request was out, another tab renewed and stored the new pair.
          setTokens(NEW)
          return HttpResponse.json({ detail: 'Could not validate credentials' }, { status: 401 })
        }
        expect(request.headers.get('Authorization')).toBe('Bearer new-access')
        return HttpResponse.json(makeUser())
      }),
    )
    renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Welcome, Ada' })).toBeInTheDocument()
    expect(refreshBodies).toEqual([])
  })

  it('ends the session when the login can no longer be renewed', async () => {
    setTokens(OLD)
    mockExpiredAccess(() => HttpResponse.json({ detail: 'Session expired' }, { status: 401 }))
    const { router } = renderApp('/stock')

    expect(
      await screen.findByText('Your session expired. Please log in again.'),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(getToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })

  it('keeps the login when the server cannot be reached to renew it', async () => {
    setTokens(OLD)
    mockExpiredAccess(() => HttpResponse.error())
    const { router } = renderApp('/')

    await waitFor(() => expect(getToken()).toBe('old-access'))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(getRefreshToken()).toBe('old-refresh')
  })
})

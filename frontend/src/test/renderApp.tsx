import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter } from 'react-router'

import { App } from '@/App'
import type { User } from '@/auth/permissions'
import { setToken } from '@/auth/token'
import { routes } from '@/routes'
import { API, server } from './server'

export function renderApp(path = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<App queryClient={queryClient} router={router} />)
  return { router, queryClient }
}

export function signInAs(user: User) {
  setToken('test-token')
  server.use(http.get(`${API}/auth/me`, () => HttpResponse.json(user)))
}

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    email: 'ada@example.com',
    name: 'Ada',
    is_admin: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    sales_access: 'none',
    purchase_access: 'none',
    inventory_access: 'none',
    ...overrides,
  }
}

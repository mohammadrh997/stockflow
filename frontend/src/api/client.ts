import createClient, { type Middleware } from 'openapi-fetch'

import { getToken } from '@/auth/token'
import type { components, paths } from './schema'

export type Schemas = components['schemas']

// The backend declares no response model for these two endpoints.
export type TokenResponse = { access_token: string; token_type: string }

let onUnauthorized: () => void = () => {}

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler
}

const authMiddleware: Middleware = {
  onRequest({ request }) {
    const token = getToken()
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`)
    }
    return request
  },
  onResponse({ response, schemaPath }) {
    if (response.status === 401 && schemaPath !== '/auth/token') {
      onUnauthorized()
    }
    return response
  },
}

export const api = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL,
  // Look fetch up on each call, so test mocks installed after import still apply.
  fetch: (request) => globalThis.fetch(request),
})
api.use(authMiddleware)

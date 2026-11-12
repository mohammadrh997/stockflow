import createClient, { type Middleware } from 'openapi-fetch'

import { renewSession } from '@/auth/refresh'
import { getRefreshToken, getToken } from '@/auth/token'
import type { components, paths } from './schema'
import { requestFinished, requestStarted } from './slowRequests'

export type Schemas = components['schemas']

export type TokenResponse = Schemas['Token']

let onUnauthorized: () => void = () => {}

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler
}

// Logging in and renewing answer 401 for wrong details, not for an expired login.
const NO_RENEWAL = new Set(['/auth/token', '/auth/refresh', '/auth/logout'])

// For each request in flight: a copy to send again, and the refresh token stored when it
// left (if that has changed by the time it fails, someone already renewed).
const inFlight = new Map<string, { copy: Request; refreshToken: string | null }>()

const authMiddleware: Middleware = {
  onRequest({ request, id, schemaPath }) {
    const token = getToken()
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`)
    }
    if (!NO_RENEWAL.has(schemaPath)) {
      inFlight.set(id, { copy: request.clone(), refreshToken: getRefreshToken() })
    }
    return request
  },
  async onResponse({ response, id }) {
    const sent = inFlight.get(id)
    inFlight.delete(id)
    if (response.status !== 401 || !sent) return response

    // The access token ran out: renew it quietly and send the request again.
    const outcome = await renewSession(sent.refreshToken)
    if (outcome.kind === 'unavailable') {
      // The login stays. The request ends with why renewing failed ("too many attempts",
      // "server unavailable", no connection), not with a 401 that reads as logged out.
      // Requests waiting on the same renewal each get their own copy of the answer.
      if (outcome.response) return outcome.response.clone()
      throw new TypeError('Could not reach the server to renew the login')
    }
    if (outcome.kind === 'renewed') {
      sent.copy.headers.set('Authorization', `Bearer ${getToken()}`)
      const retried = await globalThis.fetch(sent.copy)
      if (retried.status !== 401) return retried
    }
    onUnauthorized()
    return response
  },
  onError({ id }) {
    inFlight.delete(id)
  },
}

const slowRequestMiddleware: Middleware = {
  onRequest({ id }) {
    requestStarted(id)
  },
  onResponse({ id }) {
    requestFinished(id)
  },
  onError({ id }) {
    requestFinished(id)
  },
}

export const api = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL,
  // Look fetch up on each call, so test mocks installed after import still apply.
  fetch: (request) => globalThis.fetch(request),
})
api.use(authMiddleware, slowRequestMiddleware)

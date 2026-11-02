import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { API, server } from '@/test/server'
import { api } from './client'
import { ApiError, applyFieldErrors, errorMessage, NETWORK_ERROR_STATUS, unwrap } from './errors'

describe('unwrap', () => {
  it('returns the data of a successful response', async () => {
    server.use(http.get(`${API}/health`, () => HttpResponse.json({ status: 'ok' })))

    await expect(unwrap(api.GET('/health'))).resolves.toEqual({ status: 'ok' })
  })

  it('throws an ApiError with the status and detail', async () => {
    server.use(
      http.get(`${API}/products/:id`, () =>
        HttpResponse.json({ detail: 'Product Was Not Found' }, { status: 404 }),
      ),
    )

    const error = await unwrap(
      api.GET('/products/{product_id}', { params: { path: { product_id: 9 } } }),
    ).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, detail: 'Product Was Not Found' })
  })

  it('throws a network ApiError when there is no response', async () => {
    server.use(http.get(`${API}/health`, () => HttpResponse.error()))

    await expect(unwrap(api.GET('/health'))).rejects.toMatchObject({
      status: NETWORK_ERROR_STATUS,
    })
  })
})

describe('errorMessage', () => {
  it.each([
    [400, 'product 9 not found or archived', 'product 9 not found or archived'],
    [409, 'SKU already Exist', 'SKU already Exist'],
    [401, null, 'Your session expired. Please log in again.'],
    [403, 'Insufficient permissions', "You don't have permission to do that."],
    [404, 'Order Was Not Found', 'Order Was Not Found'],
    [429, null, 'Too many attempts. Wait a minute and try again.'],
    [503, null, 'The server is unavailable right now. Try again in a moment.'],
    [
      NETWORK_ERROR_STATUS,
      null,
      'Could not reach the server. Check your connection and try again.',
    ],
    [500, null, 'Something went wrong (status 500). Please try again.'],
  ])('status %i shows a readable message', (status, detail, expected) => {
    expect(errorMessage(new ApiError(status, detail))).toBe(expected)
  })

  it('joins 422 messages', () => {
    const error = new ApiError(422, [
      { loc: ['body', 'name'], msg: 'Field required' },
      { loc: ['body', 'sku'], msg: 'String too long' },
    ])
    expect(errorMessage(error)).toBe('Field required String too long')
  })

  it('handles errors that are not from the API', () => {
    expect(errorMessage(new TypeError('boom'))).toBe('Something went wrong. Please try again.')
  })
})

describe('applyFieldErrors', () => {
  type Form = { name: string; quantity: string }
  const fields = ['name', 'quantity'] as const

  it('maps 422 errors to fields by the last element of loc', () => {
    const setError = vi.fn()
    const error = new ApiError(422, [
      { loc: ['body', 'name'], msg: 'Field required' },
      { loc: ['body', 'lines', 0, 'quantity'], msg: 'Input should be greater than 0' },
      { loc: ['body'], msg: 'each product can only be counted once per adjustment' },
    ])

    const unmatched = applyFieldErrors<Form>(error, fields, setError)

    expect(setError).toHaveBeenCalledWith('name', { type: 'server', message: 'Field required' })
    expect(setError).toHaveBeenCalledWith('quantity', {
      type: 'server',
      message: 'Input should be greater than 0',
    })
    expect(unmatched).toEqual(['each product can only be counted once per adjustment'])
  })

  it('returns the readable message for other errors', () => {
    const setError = vi.fn()

    const unmatched = applyFieldErrors<Form>(new ApiError(409, 'Duplicate'), fields, setError)

    expect(setError).not.toHaveBeenCalled()
    expect(unmatched).toEqual(['Duplicate'])
  })
})

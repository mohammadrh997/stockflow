import { act, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeUser, renderApp, signInAs } from '@/test/renderApp'
import { API, server } from '@/test/server'
import { SLOW_REQUEST_MS } from './slowRequests'

const MESSAGE = 'Waking up the server, this can take up to a minute.'

describe('server wake-up message', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('appears while a request is slow and goes away when it answers', async () => {
    let answer: () => void = () => {}
    const answered = new Promise<void>((resolve) => {
      answer = resolve
    })
    signInAs(makeUser())
    server.use(
      http.get(`${API}/auth/me`, async () => {
        await answered
        return HttpResponse.json(makeUser())
      }),
    )
    renderApp('/')

    await act(() => vi.advanceTimersByTimeAsync(SLOW_REQUEST_MS - 100))
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(screen.getByText(MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText(/went wrong|could not/i)).not.toBeInTheDocument()

    answer()
    expect(await screen.findByRole('heading', { name: 'Welcome, Ada' })).toBeInTheDocument()
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument()
  })

  it('stays hidden for fast requests', async () => {
    signInAs(makeUser())
    renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Welcome, Ada' })).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(SLOW_REQUEST_MS * 2))
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument()
  })
})

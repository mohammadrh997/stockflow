import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { getRefreshToken, getToken } from '@/auth/token'
import { makeUser, renderApp, signInAs } from '@/test/renderApp'
import { API, server } from '@/test/server'

async function changePassword(current: string, next: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Current password'), current)
  await user.type(screen.getByLabelText('New password'), next)
  await user.type(screen.getByLabelText('Repeat new password'), next)
  await user.click(screen.getByRole('button', { name: 'Change password' }))
}

describe('profile', () => {
  it('replaces the stored tokens with the new login a password change returns', async () => {
    let authorization: string | null = null
    server.use(
      http.post(`${API}/auth/me/password`, () =>
        HttpResponse.json({
          access_token: 'fresh-token',
          refresh_token: 'fresh-refresh',
          token_type: 'bearer',
        }),
      ),
      http.patch(`${API}/auth/me`, ({ request }) => {
        authorization = request.headers.get('Authorization')
        return HttpResponse.json(makeUser({ name: 'Ada L.' }))
      }),
    )
    signInAs(makeUser())
    renderApp('/profile')

    await changePassword('password123', 'better-password')

    await waitFor(() => expect(getToken()).toBe('fresh-token'))
    expect(getRefreshToken()).toBe('fresh-refresh')
    expect(await screen.findByText('Password changed')).toBeInTheDocument()

    const user = userEvent.setup()
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Ada L.')
    await user.click(screen.getByRole('button', { name: 'Save name' }))

    await waitFor(() => expect(authorization).toBe('Bearer fresh-token'))
    expect(await screen.findByRole('button', { name: /Ada L\./ })).toBeInTheDocument()
  })

  it('shows a wrong current password on its field', async () => {
    server.use(
      http.post(`${API}/auth/me/password`, () =>
        HttpResponse.json({ detail: 'Current password is incorrect' }, { status: 400 }),
      ),
    )
    signInAs(makeUser())
    renderApp('/profile')

    await changePassword('wrong-one', 'better-password')

    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument()
    expect(screen.getByLabelText('Current password')).toHaveAttribute('aria-invalid', 'true')
    expect(getToken()).toBe('test-token')
  })

  it('checks that the new passwords match before sending', async () => {
    let called = false
    server.use(
      http.post(`${API}/auth/me/password`, () => {
        called = true
        return HttpResponse.json({ access_token: 'x', token_type: 'bearer' })
      }),
    )
    signInAs(makeUser())
    renderApp('/profile')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Current password'), 'password123')
    await user.type(screen.getByLabelText('New password'), 'better-password')
    await user.type(screen.getByLabelText('Repeat new password'), 'other-password')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('The passwords do not match.')).toBeInTheDocument()
    expect(called).toBe(false)
  })
})

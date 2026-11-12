import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { api, setUnauthorizedHandler, type TokenResponse } from '@/api/client'
import { unwrap } from '@/api/errors'
import {
  ACCESS_TOKEN_KEY,
  clearToken,
  getRefreshToken,
  getToken,
  setTokens,
  type TokenPair,
} from './token'
import { AuthContext, meQueryKey, type AuthContextValue } from './useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setTokenState] = useState(getToken)
  const [sessionExpired, setSessionExpired] = useState(false)

  const endSession = useCallback(
    (expired: boolean) => {
      clearToken()
      setTokenState(null)
      setSessionExpired(expired)
      queryClient.clear()
    },
    [queryClient],
  )

  useEffect(() => {
    setUnauthorizedHandler(() => endSession(true))
    return () => setUnauthorizedHandler(() => {})
  }, [endSession])

  // Every tab shares one login. When another tab logs out, this one follows; when another
  // logs in or renews, this one picks up the new token.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== ACCESS_TOKEN_KEY && event.key !== null) return
      const next = getToken()
      if (next === null) {
        setTokenState(null)
        setSessionExpired(false)
        queryClient.clear()
      } else {
        setTokenState(next)
        setSessionExpired(false)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [queryClient])

  const userQuery = useQuery({
    queryKey: meQueryKey,
    queryFn: () => unwrap(api.GET('/auth/me')),
    enabled: token !== null,
    staleTime: Infinity,
  })

  const login = useCallback(async (email: string, password: string) => {
    const data = (await unwrap(
      api.POST('/auth/token', {
        body: { username: email, password, scope: '' },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    )) as TokenResponse
    setTokens(data)
    setTokenState(data.access_token)
    setSessionExpired(false)
  }, [])

  const logout = useCallback(() => {
    // Tell the server, so this login can't be renewed again; the browser forgets it either
    // way, without waiting for the answer.
    const refreshToken = getRefreshToken()
    if (refreshToken) {
      api.POST('/auth/logout', { body: { refresh_token: refreshToken } }).catch(() => {})
    }
    endSession(false)
  }, [endSession])

  const replaceTokens = useCallback((next: TokenPair) => {
    setTokens(next)
    setTokenState(next.access_token)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user: userQuery.data,
      userQuery,
      sessionExpired,
      login,
      logout,
      replaceTokens,
    }),
    [token, userQuery, sessionExpired, login, logout, replaceTokens],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

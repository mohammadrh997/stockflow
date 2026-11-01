import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { api, setUnauthorizedHandler, type TokenResponse } from '@/api/client'
import { unwrap } from '@/api/errors'
import { clearToken, getToken, setToken } from './token'
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
    setToken(data.access_token)
    setTokenState(data.access_token)
    setSessionExpired(false)
  }, [])

  const logout = useCallback(() => endSession(false), [endSession])

  const value = useMemo<AuthContextValue>(
    () => ({ token, user: userQuery.data, userQuery, sessionExpired, login, logout }),
    [token, userQuery, sessionExpired, login, logout],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

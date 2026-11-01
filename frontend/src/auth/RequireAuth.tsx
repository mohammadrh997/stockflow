import { Navigate, Outlet, useLocation } from 'react-router'

import { ErrorMessage } from '@/components/ErrorMessage'
import { PageSpinner } from '@/components/PageSpinner'
import { useAuth } from './useAuth'

export type LoginLocationState = {
  from?: string
  expired?: boolean
}

export function RequireAuth() {
  const { token, userQuery, sessionExpired } = useAuth()
  const location = useLocation()

  if (!token) {
    const state: LoginLocationState = sessionExpired
      ? { from: location.pathname + location.search, expired: true }
      : {}
    return <Navigate to="/login" replace state={state} />
  }
  if (userQuery.isPending) return <PageSpinner />
  if (userQuery.isError) {
    return (
      <div className="p-8">
        <ErrorMessage error={userQuery.error} onRetry={() => userQuery.refetch()} />
      </div>
    )
  }
  return <Outlet />
}

import type { UseQueryResult } from '@tanstack/react-query'
import { createContext, useContext } from 'react'

import type { User } from './permissions'

export type AuthContextValue = {
  token: string | null
  user: User | undefined
  userQuery: UseQueryResult<User>
  sessionExpired: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

export const meQueryKey = ['me'] as const

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}

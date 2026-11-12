import type { UseQueryResult } from '@tanstack/react-query'
import { createContext, useContext } from 'react'

import type { User } from './permissions'
import type { TokenPair } from './token'

export type AuthContextValue = {
  token: string | null
  user: User | undefined
  userQuery: UseQueryResult<User>
  sessionExpired: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  // A password change starts a new login (the others end): its tokens replace the old ones.
  replaceTokens: (tokens: TokenPair) => void
}

export const meQueryKey = ['me'] as const

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}

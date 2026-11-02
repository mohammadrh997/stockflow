import type { ReactNode } from 'react'

import { ForbiddenPage } from '@/components/ForbiddenPage'
import type { User } from './permissions'
import { useAuth } from './useAuth'

type Props = {
  allowed: (user: User) => boolean
  children: ReactNode
}

export function RequireAccess({ allowed, children }: Props) {
  const { user } = useAuth()
  if (!user || !allowed(user)) return <ForbiddenPage />
  return children
}

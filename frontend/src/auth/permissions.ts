import type { Schemas } from '@/api/client'

export type User = Schemas['UserRead']
export type Module = 'sales' | 'purchase' | 'inventory'
export type Level = 'user' | 'manager'

const RANK = { none: 0, user: 1, manager: 2 } as const

const ACCESS_FIELD = {
  sales: 'sales_access',
  purchase: 'purchase_access',
  inventory: 'inventory_access',
} as const

export function can(
  user: User | null | undefined,
  module: Module | 'admin',
  level?: Level,
): boolean {
  if (!user) return false
  if (user.is_admin) return true
  if (module === 'admin') return false
  return RANK[user[ACCESS_FIELD[module]]] >= RANK[level ?? 'user']
}

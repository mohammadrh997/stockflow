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

// Customer invoices follow sales access, vendor bills follow purchase access.
export function canOnInvoices(
  user: User | null | undefined,
  invoiceType: 'customer_invoice' | 'vendor_bill',
  level?: Level,
): boolean {
  return can(user, invoiceType === 'customer_invoice' ? 'sales' : 'purchase', level)
}

export function canEditPartners(user: User | null | undefined): boolean {
  return can(user, 'sales') || can(user, 'purchase')
}

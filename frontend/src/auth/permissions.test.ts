import { describe, expect, it } from 'vitest'

import { can, type User } from './permissions'

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    email: 'someone@example.com',
    name: 'Someone',
    is_admin: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    sales_access: 'none',
    purchase_access: 'none',
    inventory_access: 'none',
    ...overrides,
  }
}

describe('can', () => {
  it('denies everything without a user', () => {
    expect(can(null, 'sales', 'user')).toBe(false)
    expect(can(undefined, 'admin')).toBe(false)
  })

  it('lets admins pass every check', () => {
    const admin = makeUser({ is_admin: true })
    expect(can(admin, 'admin')).toBe(true)
    expect(can(admin, 'sales', 'manager')).toBe(true)
    expect(can(admin, 'purchase', 'manager')).toBe(true)
    expect(can(admin, 'inventory', 'manager')).toBe(true)
  })

  it('reserves the admin area for admins', () => {
    const manager = makeUser({
      sales_access: 'manager',
      purchase_access: 'manager',
      inventory_access: 'manager',
    })
    expect(can(manager, 'admin')).toBe(false)
  })

  it('treats manager as including user', () => {
    const manager = makeUser({ purchase_access: 'manager' })
    expect(can(manager, 'purchase', 'user')).toBe(true)
    expect(can(manager, 'purchase', 'manager')).toBe(true)
  })

  it('does not let user access reach manager actions', () => {
    const user = makeUser({ sales_access: 'user' })
    expect(can(user, 'sales', 'user')).toBe(true)
    expect(can(user, 'sales', 'manager')).toBe(false)
  })

  it('denies modules with no access', () => {
    const user = makeUser({ sales_access: 'manager' })
    expect(can(user, 'purchase', 'user')).toBe(false)
    expect(can(user, 'inventory', 'user')).toBe(false)
  })

  it('defaults the level to user', () => {
    expect(can(makeUser({ inventory_access: 'user' }), 'inventory')).toBe(true)
    expect(can(makeUser(), 'inventory')).toBe(false)
  })

  describe('the permission table', () => {
    const salesUser = makeUser({ sales_access: 'user' })
    const salesManager = makeUser({ sales_access: 'manager' })
    const purchaseUser = makeUser({ purchase_access: 'user' })
    const purchaseManager = makeUser({ purchase_access: 'manager' })
    const inventoryUser = makeUser({ inventory_access: 'user' })
    const inventoryManager = makeUser({ inventory_access: 'manager' })
    const nobody = makeUser()

    const editPartners = (user: User) => can(user, 'sales') || can(user, 'purchase')

    it('products: inventory manager writes', () => {
      expect(can(inventoryManager, 'inventory', 'manager')).toBe(true)
      expect(can(inventoryUser, 'inventory', 'manager')).toBe(false)
    })

    it('partners: sales or purchase user writes', () => {
      expect(editPartners(salesUser)).toBe(true)
      expect(editPartners(purchaseUser)).toBe(true)
      expect(editPartners(inventoryManager)).toBe(false)
      expect(editPartners(nobody)).toBe(false)
    })

    it('purchase orders: user edits drafts, manager confirms and cancels', () => {
      expect(can(purchaseUser, 'purchase', 'user')).toBe(true)
      expect(can(purchaseUser, 'purchase', 'manager')).toBe(false)
      expect(can(purchaseManager, 'purchase', 'manager')).toBe(true)
      expect(can(salesManager, 'purchase', 'user')).toBe(false)
    })

    it('sales orders: user edits drafts, manager confirms and cancels', () => {
      expect(can(salesUser, 'sales', 'user')).toBe(true)
      expect(can(salesUser, 'sales', 'manager')).toBe(false)
      expect(can(salesManager, 'sales', 'manager')).toBe(true)
      expect(can(purchaseManager, 'sales', 'user')).toBe(false)
    })

    it('transfers: user validates and moves stock, manager adjusts', () => {
      expect(can(inventoryUser, 'inventory', 'user')).toBe(true)
      expect(can(inventoryUser, 'inventory', 'manager')).toBe(false)
      expect(can(inventoryManager, 'inventory', 'manager')).toBe(true)
      expect(can(salesManager, 'inventory', 'user')).toBe(false)
    })
  })
})

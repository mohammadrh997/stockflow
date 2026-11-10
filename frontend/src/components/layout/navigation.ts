import {
  ArrowLeftRight,
  Boxes,
  Building2,
  Package,
  ReceiptText,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'

import { can, canViewInvoices, type User } from '@/auth/permissions'

export type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  visible: (user: User) => boolean
}

const everyone = () => true

export const NAV_ITEMS: NavItem[] = [
  { to: '/stock', label: 'Stock', icon: Boxes, visible: everyone },
  { to: '/products', label: 'Products', icon: Package, visible: everyone },
  { to: '/partners', label: 'Partners', icon: Users, visible: everyone },
  { to: '/warehouses', label: 'Warehouses', icon: Warehouse, visible: everyone },
  {
    to: '/purchase-orders',
    label: 'Purchase orders',
    icon: Truck,
    visible: (user) => can(user, 'purchase'),
  },
  {
    to: '/sales-orders',
    label: 'Sales orders',
    icon: ShoppingCart,
    visible: (user) => can(user, 'sales'),
  },
  {
    to: '/invoices',
    label: 'Invoices',
    icon: ReceiptText,
    visible: canViewInvoices,
  },
  {
    to: '/transfers',
    label: 'Transfers',
    icon: ArrowLeftRight,
    visible: (user) => can(user, 'inventory'),
  },
  { to: '/users', label: 'Users', icon: UserCog, visible: (user) => can(user, 'admin') },
  {
    to: '/settings/company',
    label: 'Company',
    icon: Building2,
    visible: (user) => can(user, 'admin'),
  },
]

export function visibleNavItems(user: User | undefined): NavItem[] {
  return user ? NAV_ITEMS.filter((item) => item.visible(user)) : []
}

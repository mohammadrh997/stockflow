import {
  ArrowLeftRight,
  Boxes,
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'

import { can, canOnInvoices, canViewInvoices, type User } from '@/auth/permissions'

type Place = { pathname: string; search: string }

// A page inside an area, shown in the top bar while that area is open.
export type SectionLink = {
  to: string
  label: string
  visible: (user: User) => boolean
  isActive: (place: Place, user: User) => boolean
}

export type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  visible: (user: User) => boolean
  // The addresses that belong to this area, so it stays highlighted on any of them.
  paths: string[]
  sections?: SectionLink[]
}

const everyone = () => true

function under(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`)
}

// The Invoices page opens on the kind the user works on: invoices for sales, bills otherwise.
export function defaultInvoiceType(user: User | null | undefined) {
  return canOnInvoices(user, 'customer_invoice') ? 'customer_invoice' : 'vendor_bill'
}

function invoiceSection(type: 'customer_invoice' | 'vendor_bill', label: string): SectionLink {
  return {
    to: `/invoices?type=${type}`,
    label,
    visible: canViewInvoices,
    // A single invoice belongs to neither list, so neither is underlined there.
    isActive: ({ pathname, search }, user) =>
      pathname === '/invoices' &&
      (new URLSearchParams(search).get('type') ?? defaultInvoiceType(user)) === type,
  }
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/stock', label: 'Stock', icon: Boxes, visible: everyone, paths: ['/stock'] },
  { to: '/products', label: 'Products', icon: Package, visible: everyone, paths: ['/products'] },
  { to: '/partners', label: 'Partners', icon: Users, visible: everyone, paths: ['/partners'] },
  {
    to: '/warehouses',
    label: 'Warehouses',
    icon: Warehouse,
    visible: everyone,
    paths: ['/warehouses'],
  },
  {
    to: '/purchase-orders',
    label: 'Purchase orders',
    icon: Truck,
    visible: (user) => can(user, 'purchase'),
    paths: ['/purchase-orders'],
  },
  {
    to: '/sales-orders',
    label: 'Sales orders',
    icon: ShoppingCart,
    visible: (user) => can(user, 'sales'),
    paths: ['/sales-orders'],
  },
  {
    to: '/invoices',
    label: 'Invoices',
    icon: ReceiptText,
    visible: canViewInvoices,
    paths: ['/invoices'],
    sections: [
      invoiceSection('customer_invoice', 'Invoices'),
      invoiceSection('vendor_bill', 'Bills'),
    ],
  },
  {
    to: '/transfers',
    label: 'Transfers',
    icon: ArrowLeftRight,
    visible: (user) => can(user, 'inventory'),
    paths: ['/transfers'],
  },
  {
    to: '/users',
    label: 'Settings',
    icon: Settings,
    visible: (user) => can(user, 'admin'),
    paths: ['/users', '/settings'],
    sections: [
      {
        to: '/users',
        label: 'Users',
        visible: (user) => can(user, 'admin'),
        isActive: ({ pathname }) => under(pathname, '/users'),
      },
      {
        to: '/settings/company',
        label: 'Company',
        visible: (user) => can(user, 'admin'),
        isActive: ({ pathname }) => under(pathname, '/settings/company'),
      },
    ],
  },
]

export function visibleNavItems(user: User | undefined): NavItem[] {
  return user ? NAV_ITEMS.filter((item) => item.visible(user)) : []
}

export function isInArea(item: NavItem, pathname: string): boolean {
  return item.paths.some((path) => under(pathname, path))
}

// The current area's pages, when it has more than one the user can open.
export function sectionLinks(user: User | undefined, pathname: string): SectionLink[] {
  if (!user) return []
  const area = visibleNavItems(user).find((item) => isInArea(item, pathname))
  const links = area?.sections?.filter((link) => link.visible(user)) ?? []
  return links.length > 1 ? links : []
}
